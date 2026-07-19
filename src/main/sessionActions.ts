/**
 * Actions ponctuelles sur la session web : effacer les données de navigation,
 * choisir un dossier de téléchargement. Isolées ici pour éviter un cycle
 * d'import entre index.ts (bootstrap) et ipc.ts (handlers).
 */
import { dialog, session, type BrowserWindow } from 'electron'

type StorageKind =
  | 'cookies'
  | 'localstorage'
  | 'indexdb'
  | 'serviceworkers'
  | 'cachestorage'
  | 'shadercache'
  | 'filesystem'

/**
 * Efface le cache et/ou les cookies + données de site d'une partition.
 * L'API Electron ne permet pas de filtrer par date : c'est tout ou rien
 * (contrairement à l'historique et aux téléchargements, gérés dans nos
 * propres tables et donc filtrables par plage temporelle).
 */
export async function clearBrowsingData(
  partition: string,
  kinds: ('cache' | 'cookies')[]
): Promise<void> {
  const webSession = session.fromPartition(partition)
  if (kinds.includes('cache')) await webSession.clearCache()
  if (kinds.includes('cookies')) {
    // « Cookies et autres données de site », comme la case à cocher de Chrome.
    const storages: StorageKind[] = [
      'cookies',
      'localstorage',
      'indexdb',
      'serviceworkers',
      'cachestorage',
      'shadercache',
      'filesystem'
    ]
    await webSession.clearStorageData({ storages })
  }
}

/** Efface toutes les données stockées (cookies + stockage) d'UNE origine
 * précise — contrairement à `clearBrowsingData`, qui vide toute la partition.
 * Utilisé par « Gérer les données des sites sur l'appareil » (suppression
 * par site, photo 5) et la page de réglages par site (en-tête cookies). */
export async function clearOriginData(partition: string, origin: string): Promise<void> {
  const storages: StorageKind[] = [
    'cookies',
    'localstorage',
    'indexdb',
    'serviceworkers',
    'cachestorage',
    'shadercache',
    'filesystem'
  ]
  await session.fromPartition(partition).clearStorageData({ origin, storages })
}

/** Sélecteur de dossier natif (réglage du dossier de téléchargement). */
export async function chooseDirectory(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Dossier de téléchargement',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}
