/**
 * Avatars de profil personnalisés (image importée par l'utilisateur).
 * Les fichiers sont copiés dans userData/avatars/ et servis via le protocole
 * `aether://avatars/<fichier>` — jamais exposés par un chemin absolu au renderer.
 */
import { app, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'

export function avatarsDir(): string {
  return join(app.getPath('userData'), 'avatars')
}

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** Ouvre un sélecteur d'image ; copie le fichier choisi et retourne son nom. */
export async function chooseAndSaveAvatarImage(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "Choisir une image d'avatar",
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const source = result.filePaths[0]
  const ext = extname(source).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return null

  mkdirSync(avatarsDir(), { recursive: true })
  const filename = `${randomUUID()}${ext}`
  copyFileSync(source, join(avatarsDir(), filename))
  return filename
}

/** Supprime un fichier d'avatar (best-effort, silencieux si absent). */
export function deleteAvatarImage(filename: string): void {
  if (!filename) return
  try {
    unlinkSync(join(avatarsDir(), filename))
  } catch {
    // Déjà absent — sans conséquence.
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Tout fichier de ce dossier est nommé par `chooseAndSaveAvatarImage`
 * ci-dessus (`randomUUID() + extension`, jamais autre chose) — même motif
 * que `AVATAR_FILE_RE` dans protocol.ts, qui sert ces mêmes fichiers via
 * `aether://avatars/<fichier>`. Un simple contrôle d'extension (comme avant)
 * laissait passer un `filename` du type `../../../ailleurs/photo.png` :
 * `join(avatarsDir(), filename)` ressort alors du dossier et relit un
 * fichier arbitraire du disque (limité aux extensions image) — ce handler
 * étant exposé tel quel à l'IPC (`newtab:background-image-data-url`), sans
 * validation Zod côté appelant. */
const AVATAR_FILENAME_RE = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i

/** Relit un fichier déjà importé (avatar OU fond d'écran, même dossier géré)
 * en `data:` URI — utilisé pour l'extraction de couleur dominante côté
 * renderer (un `<img>` chargé depuis une `data:` URI ne pollue JAMAIS le
 * canvas contrairement à une image cross-origin via `aether://`, quel que
 * soit le réglage CORS du protocole personnalisé). */
export function avatarImageDataUrl(filename: string): string | null {
  if (!AVATAR_FILENAME_RE.test(filename)) return null
  const mime = MIME_BY_EXT[extname(filename).toLowerCase()]
  if (!mime) return null
  try {
    const buf = readFileSync(join(avatarsDir(), filename))
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
