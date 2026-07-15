/**
 * Protocole custom `aether://` — sert les aperçus de pages (JPEG capturés)
 * et les avatars de profil importés, sans passer par file:// ni par l'IPC.
 * Seuls `aether://previews/<uuid>.jpg` et `aether://avatars/<uuid>.<ext>`
 * sont autorisés.
 */
import { app, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { avatarsDir } from './avatars'

const PREVIEW_FILE_RE = /^[0-9a-f-]{36}\.jpg$/
const AVATAR_FILE_RE = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$/i

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** À appeler AVANT app.whenReady(). */
export function registerAetherScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'aether',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function previewsDir(): string {
  return join(app.getPath('userData'), 'previews')
}

/** À appeler APRÈS app.whenReady(). */
export function installAetherProtocol(): void {
  protocol.handle('aether', async (request) => {
    try {
      const url = new URL(request.url)
      const file = url.pathname.replace(/^\//, '')

      if (url.host === 'previews') {
        if (!PREVIEW_FILE_RE.test(file)) return new Response(null, { status: 403 })
        const data = await readFile(join(previewsDir(), file))
        return new Response(new Uint8Array(data), {
          headers: {
            'Content-Type': 'image/jpeg',
            // Le renderer ajoute ?v=<version> pour invalider — cache agressif OK.
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
      }

      if (url.host === 'newtab') {
        // Page de nouvel onglet : un vrai document (vide) est chargé — PageSlot.tsx
        // masque intégralement cette vue native derrière NewTabPage (composant
        // React), mais un VRAI chargement est nécessaire pour que Chromium
        // inscrive une entrée dans l'historique de navigation de l'onglet
        // (sinon le bouton « retour » ne peut jamais revenir à cette page
        // après avoir recherché/navigué ailleurs — cf ViewManager.ensureLive).
        return new Response('<!doctype html><title>Nouvel onglet</title>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }

      if (url.host === 'avatars') {
        if (!AVATAR_FILE_RE.test(file)) return new Response(null, { status: 403 })
        const data = await readFile(join(avatarsDir(), file))
        return new Response(new Uint8Array(data), {
          headers: {
            'Content-Type': MIME_BY_EXT[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
      }

      return new Response(null, { status: 404 })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
