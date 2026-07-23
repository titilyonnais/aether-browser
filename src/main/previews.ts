/**
 * Capture d'aperçus des pages. Les captures sont redimensionnées, encodées
 * en JPEG et écrites sur disque ; le renderer les consomme via `aether://`.
 * Un throttle par page évite de capturer en rafale.
 */
import type { WebContentsView } from 'electron'
import { mkdirSync } from 'node:fs'
import { readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pagesRepo } from './db/repositories'
import { previewsDir } from './protocol'

const MIN_INTERVAL_MS = 2500
// 1600px/85 (au lieu de 1000px/74) : le mode Toile zoome les cartes jusqu'à
// ×2.5 (SpatialCanvas.tsx, ZOOM_MAX) via `transform: scale()` — un aperçu
// figé à 1000px devenait visiblement flou/pixélisé une fois agrandi. La marge
// déjà prévue pour l'éviction (MAX_TOTAL_BYTES/MAX_FILE_COUNT) absorbe la
// hausse de poids par fichier.
const TARGET_WIDTH = 1600
/** Bornes de l'éviction (voir `cleanupPreviews`) — au-delà, les aperçus les
 * plus anciens (mtime) sont supprimés en premier, jusqu'à repasser sous les
 * deux limites. Généreux pour un usage normal (un aperçu pèse ~20-80 Ko) tout
 * en bornant la croissance sur la durée de vie de l'appli. */
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_FILE_COUNT = 2000
const PREVIEW_FILENAME_RE = /^([0-9a-f-]{36})\.jpg$/i

const lastCapture = new Map<string, number>()
let dirReady = false

function ensureDir(): void {
  if (dirReady) return
  mkdirSync(previewsDir(), { recursive: true })
  dirReady = true
}

/**
 * Capture l'aperçu d'une page si possible (vue vivante, peinte, throttle OK).
 * Retourne la nouvelle version d'aperçu, ou null si rien n'a été capturé.
 */
export async function capturePreview(
  pageId: string,
  view: WebContentsView,
  force = false
): Promise<number | null> {
  const now = Date.now()
  const last = lastCapture.get(pageId) ?? 0
  if (!force && now - last < MIN_INTERVAL_MS) return null
  if (view.webContents.isDestroyed() || view.webContents.isCrashed()) return null
  if (view.webContents.isLoading() && !force) return null

  try {
    lastCapture.set(pageId, now)
    const image = await view.webContents.capturePage()
    const size = image.getSize()
    if (size.width < 10 || size.height < 10) return null

    const resized =
      size.width > TARGET_WIDTH
        ? image.resize({ width: TARGET_WIDTH, quality: 'good' })
        : image
    const jpeg = resized.toJPEG(85)
    if (jpeg.length === 0) return null

    ensureDir()
    await writeFile(join(previewsDir(), `${pageId}.jpg`), jpeg)
    return pagesRepo.bumpPreview(pageId)
  } catch {
    return null
  }
}

/** Supprime l'aperçu d'une page fermée. */
export function deletePreview(pageId: string): void {
  lastCapture.delete(pageId)
  void rm(join(previewsDir(), `${pageId}.jpg`), { force: true }).catch(() => undefined)
}

export interface PreviewsCleanupResult {
  removedOrphans: number
  removedForLimit: number
  freedBytes: number
}

/** Taille actuelle du dossier d'aperçus (Réglages › Performance). */
export async function previewsDirSize(): Promise<number> {
  ensureDir()
  let entries: string[]
  try {
    entries = await readdir(previewsDir())
  } catch {
    return 0
  }
  let total = 0
  for (const file of entries) {
    try {
      total += (await stat(join(previewsDir(), file))).size
    } catch {
      // Disparu entretemps — ignoré.
    }
  }
  return total
}

/** Supprime les aperçus ORPHELINS (page fermée sans passer par `deletePreview`
 * — suppression d'un espace/profil entier, crash) puis, si le dossier dépasse
 * encore une des deux limites, évince les plus anciens (mtime croissant)
 * jusqu'à repasser dessous. Appelée au démarrage et depuis Réglages › Données. */
export async function cleanupPreviews(): Promise<PreviewsCleanupResult> {
  ensureDir()
  let entries: string[]
  try {
    entries = await readdir(previewsDir())
  } catch {
    return { removedOrphans: 0, removedForLimit: 0, freedBytes: 0 }
  }

  const validIds = new Set(pagesRepo.listAll().map((p) => p.id))
  let removedOrphans = 0
  let freedBytes = 0
  const kept: { file: string; mtimeMs: number; size: number }[] = []

  for (const file of entries) {
    const full = join(previewsDir(), file)
    const pageId = PREVIEW_FILENAME_RE.exec(file)?.[1]
    if (!pageId || !validIds.has(pageId)) {
      try {
        freedBytes += (await stat(full)).size
      } catch {
        // Disparu entretemps — sans conséquence, rien à compter.
      }
      await rm(full, { force: true }).catch(() => undefined)
      removedOrphans++
      continue
    }
    try {
      const st = await stat(full)
      kept.push({ file, mtimeMs: st.mtimeMs, size: st.size })
    } catch {
      // Disparu entre le readdir et le stat — ignoré.
    }
  }

  let removedForLimit = 0
  let totalBytes = kept.reduce((sum, k) => sum + k.size, 0)
  if (totalBytes > MAX_TOTAL_BYTES || kept.length > MAX_FILE_COUNT) {
    kept.sort((a, b) => a.mtimeMs - b.mtimeMs)
    while (kept.length > 0 && (totalBytes > MAX_TOTAL_BYTES || kept.length > MAX_FILE_COUNT)) {
      const oldest = kept.shift()
      if (!oldest) break
      await rm(join(previewsDir(), oldest.file), { force: true }).catch(() => undefined)
      totalBytes -= oldest.size
      freedBytes += oldest.size
      removedForLimit++
    }
  }

  return { removedOrphans, removedForLimit, freedBytes }
}
