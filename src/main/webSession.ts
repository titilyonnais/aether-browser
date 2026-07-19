/**
 * Sessions web par profil. Chaque profil possède sa propre partition :
 * persistante (`persist:aether-web-<profileId>`) pour un profil normal —
 * cookies, connexions, cache et stockage cloisonnés, comme dans Chrome —
 * ou **en mémoire** (sans préfixe `persist:`, wipée à la fermeture) pour un
 * profil de navigation privée. Le durcissement (UA, permissions, DNT, HTTPS
 * d'abord, proxy, téléchargements) est appliqué paresseusement, une fois
 * par partition.
 */
import { app, session, type DownloadItem, type Session } from 'electron'
import { basename, join } from 'node:path'
import { CH } from '@shared/ipc'
import type { ProfileId, SitePermissionKind } from '@shared/types'
import { installCertificateObserver } from './certificates'
import { downloadsRepo, sitePermissionsRepo } from './db/repositories'
import { requestPermissionPrompt } from './permissionPromptWindow'
import { getSettings } from './settings'
import { ownerContextForPageWebContents, windowContextsForProfile } from './windowRegistry'

export function webPartitionForProfile(profileId: ProfileId, isPrivate: boolean): string {
  return isPrivate ? `aether-private-${profileId}` : `persist:aether-web-${profileId}`
}

const hardened = new Set<string>()

/** Téléchargements en cours, pour permettre l'annulation depuis le renderer. */
export const liveDownloads = new Map<string, DownloadItem>()

/** Toujours autorisées (sans risque, nécessaires à une navigation normale). */
const ALWAYS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write'])

/** Fait correspondre un nom de permission Electron à notre kind de site. */
function toSiteKind(permission: string): SitePermissionKind | null {
  switch (permission) {
    case 'media':
      return 'media'
    case 'geolocation':
      return 'geolocation'
    case 'notifications':
      return 'notifications'
    default:
      return null
  }
}

function globalDefault(kind: SitePermissionKind): boolean {
  const s = getSettings()
  if (kind === 'media') return s.allowMedia
  if (kind === 'geolocation') return s.allowGeolocation
  return s.allowNotifications
}

/**
 * Décision de permission : surcharge par site (si définie pour ce profil et
 * cette origine) sinon réglage global — lus EN DIRECT, un changement
 * s'applique aussitôt, comme les réglages de site de Chrome.
 */
function decide(profileId: ProfileId, permission: string, origin: string): boolean {
  if (ALWAYS.has(permission)) return true
  const kind = toSiteKind(permission)
  if (!kind) return false
  const override = origin ? sitePermissionsRepo.get(profileId, origin, kind) : null
  if (override === 'allow') return true
  if (override === 'block') return false
  return globalDefault(kind)
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/** Applique les langues du correcteur orthographique à une partition (Langues).
 * Liste vide = on laisse Electron/Chromium à sa détection système par défaut. */
export function applySpellcheckLanguages(partition: string): void {
  const langs = getSettings().spellcheckLanguages
  if (langs.length === 0) return
  try {
    session.fromPartition(partition).setSpellCheckerLanguages(langs)
  } catch {
    // Code de langue non reconnu par ce build Chromium — ignoré silencieusement.
  }
}

/** Applique le mode proxy des réglages à une partition (Système). */
export function applyProxy(partition: string): void {
  const s = getSettings()
  const webSession = session.fromPartition(partition)
  if (s.proxyMode === 'custom' && s.proxyRules.trim()) {
    void webSession.setProxy({ proxyRules: s.proxyRules.trim() })
  } else if (s.proxyMode === 'direct') {
    void webSession.setProxy({ mode: 'direct' })
  } else {
    void webSession.setProxy({ mode: 'system' })
  }
}

/** Garantit qu'une partition est durcie (idempotent). Retourne la session. */
export function ensurePartitionHardened(partition: string, profileId: ProfileId): Session {
  const webSession = session.fromPartition(partition)
  if (hardened.has(partition)) return webSession
  hardened.add(partition)

  // Les sites voient un Chrome standard, pas un Electron.
  const cleanUa = webSession
    .getUserAgent()
    .replace(/\sElectron\/[\d.]+/i, '')
    .replace(/\saether-browser\/[\d.]+/i, '')
  webSession.setUserAgent(cleanUa)

  // `setPermissionCheckHandler` DOIT rester synchrone (Electron n'attend pas
  // de promesse ici) — jamais d'invite, toujours `decide()` tel quel.
  webSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    decide(profileId, permission, requestingOrigin)
  )
  // `setPermissionRequestHandler`, lui, accepte un `callback` invoqué de façon
  // DIFFÉRÉE — c'est le seul endroit où une vraie invite a du sens. Une
  // surcharge de site déjà connue (allow/block), ou le réglage global déjà à
  // `true`, tranchent sans rien demander (chemin synchrone inchangé, identique
  // à `decide()`) ; SEUL le cas « aucune surcharge, réglage global désactivé »
  // (par défaut) déclenche l'invite — avant ce correctif, ce cas retombait
  // silencieusement sur un refus, sans le moindre signe visible pour
  // l'utilisateur (« un site demande le micro, rien ne se passe »).
  webSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS.has(permission)) {
      callback(true)
      return
    }
    const origin = originOf(details.requestingUrl)
    const kind = toSiteKind(permission)
    if (!kind || !origin) {
      callback(false)
      return
    }
    const override = sitePermissionsRepo.get(profileId, origin, kind)
    if (override === 'allow') {
      callback(true)
      return
    }
    if (override === 'block') {
      callback(false)
      return
    }
    if (globalDefault(kind)) {
      callback(true)
      return
    }
    const owner = ownerContextForPageWebContents(wc)?.ctx.win
    if (!owner) {
      callback(false)
      return
    }
    void requestPermissionPrompt(owner, profileId, origin, kind, wc).then(callback)
  })

  installCertificateObserver(partition)

  // Do Not Track : en-tête DNT ajouté à la volée selon le réglage.
  webSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders }
    if (getSettings().doNotTrack) requestHeaders['DNT'] = '1'
    else delete requestHeaders['DNT']
    callback({ requestHeaders })
  })

  // HTTPS d'abord : les navigations principales en http:// sont hissées en https://.
  webSession.webRequest.onBeforeRequest((details, callback) => {
    if (
      getSettings().httpsOnly &&
      details.resourceType === 'mainFrame' &&
      details.url.startsWith('http://')
    ) {
      callback({ redirectURL: details.url.replace(/^http:\/\//i, 'https://') })
      return
    }
    callback({})
  })

  applyProxy(partition)
  applySpellcheckLanguages(partition)

  webSession.on('will-download', (_event, item) => {
    const s = getSettings()
    if (!s.askDownloadLocation) {
      const dir = s.downloadDir || app.getPath('downloads')
      // `basename()` en défense en profondeur : `getFilename()` vient in fine
      // du site distant (Content-Disposition) — Chromium le nettoie déjà
      // normalement, mais ne jamais faire dépendre un `join()` vers un chemin
      // de fichier réel de la seule sanitation d'un composant tiers hors de
      // notre contrôle.
      item.setSavePath(join(dir, basename(item.getFilename())))
    }

    const id = downloadsRepo.create(profileId, {
      filename: item.getFilename(),
      path: item.getSavePath(),
      url: item.getURL(),
      totalBytes: item.getTotalBytes()
    })
    liveDownloads.set(id, item)

    // Une partition est durcie/enregistrée UNE SEULE fois (`hardened`, plus
    // haut) — si plusieurs fenêtres partagent ce profil, ce `will-download`
    // (posé par la toute première d'entre elles à démarrer) doit prévenir
    // TOUTES les fenêtres qui affichent actuellement ce profil, pas
    // seulement celle qui l'a initialisé.
    const notify = (): void => {
      for (const ctx of windowContextsForProfile(profileId)) {
        if (!ctx.win.isDestroyed()) ctx.win.webContents.send(CH.downloadUpdated, id)
      }
    }
    notify()

    item.on('updated', (_e, state) => {
      if (state === 'progressing') downloadsRepo.updateProgress(id, item.getReceivedBytes())
      notify()
    })

    item.once('done', (_e, state) => {
      liveDownloads.delete(id)
      downloadsRepo.finish(
        id,
        state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted',
        item.getSavePath()
      )
      notify()
    })
  })

  return webSession
}
