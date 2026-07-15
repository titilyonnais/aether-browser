/**
 * Mises à jour ÆTHER — `electron-updater` sur GitHub Releases (dépôt PUBLIC :
 * l'app distribuée lit les releases publiques sans le moindre jeton embarqué,
 * seule la PUBLICATION d'une release depuis la machine de développement en
 * nécessite un, cf. README/electron-builder.yml). Comme Chrome : vérification
 * silencieuse au lancement, téléchargement automatique en arrière-plan dès
 * qu'une mise à jour est trouvée, puis c'est SEULEMENT l'installation
 * (redémarrage) qui attend un geste explicite de l'utilisateur.
 *
 * `electron-updater` ne fonctionne que dans un vrai paquet installé (lit
 * `app-update.yml`, généré par electron-builder à partir de `publish` —
 * absent d'un lancement `npm run dev`) — `app.isPackaged` sert de garde.
 */
import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CH } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'

let win: BrowserWindow | null = null
let status: UpdateStatus = { state: 'idle' }

function setStatus(next: UpdateStatus): void {
  status = next
  if (win && !win.isDestroyed()) win.webContents.send(CH.updatesStatusChanged, status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  if (!app.isPackaged) {
    setStatus({ state: 'dev-mode' })
    return
  }

  // On pilote nous-mêmes le téléchargement (pour distinguer « disponible » de
  // « en cours de téléchargement » dans l'UI) plutôt que le tout-en-un
  // `checkForUpdatesAndNotify` — et JAMAIS d'installation sans un clic explicite.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'downloading', version: info.version, percent: 0 })
    void autoUpdater.downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => setStatus({ state: 'up-to-date', checkedAt: Date.now() }))

  autoUpdater.on('download-progress', (progress) => {
    if (status.state !== 'downloading') return
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', version: info.version }))

  autoUpdater.on('error', (err) => setStatus({ state: 'error', message: err.message || 'Erreur inconnue' }))
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    setStatus({ state: 'dev-mode' })
    return
  }
  void autoUpdater.checkForUpdates().catch((err) => {
    setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' })
  })
}

export function installUpdate(): void {
  if (status.state !== 'downloaded') return
  autoUpdater.quitAndInstall()
}
