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

/** Répond faux pour une simple coupure réseau/passerelle (504/502/503,
 * timeout, DNS…) — le genre d'échec qui se résout tout seul en réessayant
 * quelques secondes plus tard (déjà observé sur les assets GitHub Releases
 * juste après publication). */
function isTransientNetworkError(message: string): boolean {
  return /\b(50[0234])\b/.test(message) || /timeout|ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED/i.test(message)
}

/** Le message brut d'electron-builder pour une erreur réseau inclut un dump
 * JSON complet des en-têtes HTTP — illisible et jamais actionnable pour
 * l'utilisateur. On le remplace par une phrase compréhensible pour ce cas
 * précis ; les autres erreurs (rares) gardent leur message d'origine. */
function friendlyUpdateErrorMessage(raw: string): string {
  if (isTransientNetworkError(raw)) {
    return 'Impossible de joindre GitHub pour vérifier les mises à jour (problème réseau temporaire). Réessayez plus tard.'
  }
  return raw
}

/** Délais avant chaque nouvelle tentative silencieuse (ms) — seulement pour
 * un échec de la phase de VÉRIFICATION (pas un téléchargement déjà en
 * cours), détecté via `status.state === 'checking'`, seul indicateur fiable
 * de la phase en cours (electron-updater émet `'error'` pour toute
 * défaillance interne, vérification ou téléchargement confondus). */
const CHECK_RETRY_DELAYS_MS = [2000, 5000]
let checkRetryAttempt = 0

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
    checkRetryAttempt = 0
    setStatus({ state: 'downloading', version: info.version, percent: 0 })
    void autoUpdater.downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    checkRetryAttempt = 0
    setStatus({ state: 'up-to-date', checkedAt: Date.now() })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (status.state !== 'downloading') return
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', version: info.version }))

  autoUpdater.on('error', (err) => {
    const raw = err.message || 'Erreur inconnue'
    if (status.state === 'checking' && isTransientNetworkError(raw) && checkRetryAttempt < CHECK_RETRY_DELAYS_MS.length) {
      const delay = CHECK_RETRY_DELAYS_MS[checkRetryAttempt]
      checkRetryAttempt++
      setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), delay)
      return
    }
    checkRetryAttempt = 0
    setStatus({ state: 'error', message: friendlyUpdateErrorMessage(raw) })
  })
}

export function checkForUpdates(): void {
  checkRetryAttempt = 0
  if (!app.isPackaged) {
    setStatus({ state: 'dev-mode' })
    return
  }
  // L'échec est déjà traité par l'écouteur `'error'` ci-dessus — electron-updater
  // émet TOUJOURS cet évènement avant de faire échouer cette promesse — donc
  // rien à faire ici hormis absorber le rejet pour éviter un avertissement
  // « unhandled rejection ».
  void autoUpdater.checkForUpdates().catch(() => undefined)
}

export function installUpdate(): void {
  if (status.state !== 'downloaded') return
  autoUpdater.quitAndInstall()
}
