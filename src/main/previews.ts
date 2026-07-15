/**
 * Capture d'aperçus des pages. Les captures sont redimensionnées, encodées
 * en JPEG et écrites sur disque ; le renderer les consomme via `aether://`.
 * Un throttle par page évite de capturer en rafale.
 */
import type { WebContentsView } from 'electron'
import { mkdirSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pagesRepo } from './db/repositories'
import { previewsDir } from './protocol'

const MIN_INTERVAL_MS = 2500
const TARGET_WIDTH = 1000

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
    const jpeg = resized.toJPEG(74)
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
