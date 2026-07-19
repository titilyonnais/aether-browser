/**
 * Moteur de blocage de contenu par origine — Cookies, Images, JavaScript,
 * Popups et redirections, Téléchargements automatiques, Contenu non
 * sécurisé (les 6 catégories de blocage du chantier permissions/site,
 * distinctes des permissions « invite » comme caméra/localisation).
 *
 * DÉLÉGUÉ depuis les points d'entrée UNIQUES de `webSession.ts`
 * (`onBeforeRequest`/`onHeadersReceived`, chacun limité à UN SEUL
 * enregistrement par session — un second écraserait silencieusement le
 * premier, notamment la redirection HTTPS-d'abord déjà en place) : ce
 * fichier n'enregistre AUCUN handler lui-même, seulement des fonctions pures
 * appelées depuis ces points d'entrée.
 */
import type {
  CallbackResponse,
  HeadersReceivedResponse,
  OnBeforeRequestListenerDetails,
  OnHeadersReceivedListenerDetails
} from 'electron'
import type { ProfileId, SitePermissionKind } from '@shared/types'
import { sitePermissionsRepo } from './db/repositories'
import { getSettings } from './settings'

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Origine de la PAGE (cadre de premier niveau) — « bloquer les images »/
 * « bloquer le JS » se décide par site VISITÉ, pas par l'hébergeur de la
 * ressource elle-même. `null` si indéterminable (cadre détruit/navigué
 * entre-temps) : on laisse alors passer, en échec ouvert plutôt que de
 * bloquer au hasard une ressource dont on ne peut pas identifier le site. */
function pageOriginFor(details: OnBeforeRequestListenerDetails): string | null {
  if (details.resourceType === 'mainFrame') return originOf(details.url)
  const topUrl = details.frame?.top?.url
  return topUrl ? originOf(topUrl) : null
}

/** Surcharge de site si elle existe, sinon réglage global — même logique de
 * priorité que `webSession.ts`'s `decide()`, pour les catégories de blocage. */
function siteBlocks(profileId: ProfileId, origin: string, kind: SitePermissionKind, globalBlock: boolean): boolean {
  const override = sitePermissionsRepo.get(profileId, origin, kind)
  if (override === 'allow') return false
  if (override === 'block') return true
  return globalBlock
}

/** Appelé depuis l'unique `onBeforeRequest` de `webSession.ts`, APRÈS la
 * redirection HTTPS-d'abord (qui a priorité). Retourne une réponse à
 * court-circuiter (`{cancel:true}`), ou `null` pour continuer le flux normal
 * (aucune règle de blocage ne s'applique à cette requête). */
export function contentBlockingBeforeRequest(
  profileId: ProfileId,
  details: OnBeforeRequestListenerDetails
): CallbackResponse | null {
  const settings = getSettings()

  // Contenu non sécurisé (mixed content) : ressource http:// chargée depuis
  // une page https:// — Chromium bloque déjà nativement le cas actif
  // (scripts), ceci couvre en plus images/médias selon réglage/surcharge.
  if (
    details.resourceType !== 'mainFrame' &&
    details.url.startsWith('http://') &&
    (details.resourceType === 'image' || details.resourceType === 'media' || details.resourceType === 'script')
  ) {
    const pageOrigin = pageOriginFor(details)
    if (
      pageOrigin?.startsWith('https://') &&
      siteBlocks(profileId, pageOrigin, 'insecureContent', settings.blockInsecureContent)
    ) {
      return { cancel: true }
    }
  }

  if (details.resourceType === 'image') {
    const pageOrigin = pageOriginFor(details)
    if (pageOrigin && siteBlocks(profileId, pageOrigin, 'images', settings.blockImages)) {
      return { cancel: true }
    }
  }

  // JavaScript — limite assumée et documentée dans l'UI (Réglages) : seuls
  // les `<script src>` EXTERNES sont couverts, pas de bascule Electron
  // dynamique pour désactiver le JS par origine ; le JS inline continue de
  // s'exécuter normalement.
  if (details.resourceType === 'script') {
    const pageOrigin = pageOriginFor(details)
    if (pageOrigin && siteBlocks(profileId, pageOrigin, 'javascript', settings.blockJavascript)) {
      return { cancel: true }
    }
  }

  return null
}

/** Appelé depuis l'unique `onHeadersReceived` de `webSession.ts`. Décidé par
 * l'origine de la RÉPONSE elle-même (pas celle de la page) : « cookies
 * bloqués pour ce site » couvre aussi ce site chargé en tiers intégré. */
export function contentBlockingHeadersReceived(
  profileId: ProfileId,
  details: OnHeadersReceivedListenerDetails
): HeadersReceivedResponse | null {
  const origin = originOf(details.url)
  if (!origin) return null
  if (!siteBlocks(profileId, origin, 'cookies', !getSettings().allowCookies)) return null
  const responseHeaders = { ...details.responseHeaders }
  for (const key of Object.keys(responseHeaders)) {
    if (key.toLowerCase() === 'set-cookie') delete responseHeaders[key]
  }
  return { responseHeaders }
}

/** Origines dont le prochain téléchargement doit être traité comme
 * « automatique » (déjà eu un téléchargement depuis la dernière navigation
 * de premier niveau de cette page) — indexé par `WebContents.id`, remis à
 * zéro par `noteMainFrameNavigation` (appelé depuis `viewManager.ts`). */
const downloadedSinceNav = new Set<number>()

export function noteMainFrameNavigation(webContentsId: number): void {
  downloadedSinceNav.delete(webContentsId)
}

/** Heuristique façon Chrome : le PREMIER téléchargement après une navigation
 * est toujours autorisé ; un second déclenché par la même page sans
 * nouvelle navigation entre les deux est traité comme automatique et soumis
 * à la surcharge/réglage global. */
export function shouldBlockAutoDownload(profileId: ProfileId, origin: string, webContentsId: number): boolean {
  const isFirstSinceNav = !downloadedSinceNav.has(webContentsId)
  downloadedSinceNav.add(webContentsId)
  if (isFirstSinceNav) return false
  return siteBlocks(profileId, origin, 'autoDownloads', !getSettings().allowAutoDownloads)
}

/** Popups et redirections : une seule catégorie côté utilisateur (comme dans
 * sa liste d'origine), une seule fonction ici — appelée depuis
 * `setWindowOpenHandler` (viewManager.ts) et depuis `will-redirect`
 * (également viewManager.ts, événement par `WebContents`, pas par session). */
export function siteBlocksPopups(profileId: ProfileId, origin: string): boolean {
  return siteBlocks(profileId, origin, 'popups', !getSettings().allowPopups)
}
