/**
 * Avatars de profil personnalisés (image importée par l'utilisateur).
 * Les fichiers sont copiés dans userData/avatars/ et servis via le protocole
 * `aether://avatars/<fichier>` — jamais exposés par un chemin absolu au renderer.
 */
import { app, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs'
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
