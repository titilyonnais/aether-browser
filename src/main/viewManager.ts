/**
 * ViewManager — orchestration des WebContentsView natives.
 *
 * Choix d'architecture : les pages web vivent dans des WebContentsView
 * attachées à la fenêtre (rapides, sandboxées, sans <webview>), positionnées
 * au pixel près sous les zones que le renderer réserve en mode Focus.
 * Le mode Canvas n'affiche JAMAIS de vue vivante : il consomme les aperçus
 * JPEG capturés ici — d'où une toile 100 % DOM, fluide et légère.
 *
 * Une LRU limite le nombre de pages chargées simultanément ; les autres
 * restent de simples cartes (métadonnées + aperçu) réhydratées à la demande.
 */
import { app, dialog, WebContentsView, clipboard, shell, type BrowserWindow, type WebContents } from 'electron'
import { writeFile } from 'node:fs/promises'
import { resolveInternalRoute } from '@shared/intent'
import type { Bounds, ContextMenuRow, PageContext, PageId, ProfileId, ShortcutCommand, SpaceId } from '@shared/types'
import { getSettings } from './settings'
import { pagesRepo, type PageRow } from './db/repositories'
import { hidePopoverWindow, showContextMenuPopover } from './popoverWindow'
import { capturePreview, deletePreview } from './previews'
import { ensurePartitionHardened, webPartitionForProfile } from './webSession'

/** Paliers de zoom façon Chrome (25 % à 500 %) — `setZoomFactor` cible directement
 * un pourcentage exact, contrairement à `setZoomLevel` dont les incréments ne
 * correspondent à aucune valeur ronde prévisible. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Hôtes du vrai Chrome Web Store — seuls hôtes où le crochet ci-dessous s'injecte. */
const STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com'])

function isStoreHost(url: string): boolean {
  try {
    return STORE_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Préfixe du signal « proposer l'installation de cette extension » (voir plus bas)
 * — jamais un vrai titre de page, intercepté avant `pagesRepo.updateTitle`. */
const INSTALL_CONFIRM_PREFIX = '__AETHER_INSTALL_CONFIRM__:'

/**
 * Script injecté UNIQUEMENT sur le vrai Chrome Web Store, le plus tôt possible
 * (avant le premier script de la page — voir `ensureStoreShim`, via le CDP
 * `Page.addScriptToEvaluateOnNewDocument`, PAS `dom-ready` qui arrive après que
 * le bundle du Store a déjà décidé si son bouton « Ajouter à Chrome » est grisé).
 *
 * On fournit ce qui manque à Electron pour que le VRAI bouton de Google
 * s'active : `navigator.userAgentData.brands` (Client Hints) n'inclut jamais
 * "Google Chrome" sur un Chromium OSS/Electron — seul le binaire de Google
 * l'ajoute — et `chrome.webstorePrivate`, l'API interne que le Store appelle
 * pour piloter l'installation, n'existe pas du tout hors de Chrome. On
 * complète les deux : Client Hints avec la marque manquante, et un
 * `chrome.webstorePrivate` qui redirige `beginInstallWithManifest3`/
 * `completeInstall`/`install` vers notre propre popup de confirmation (voir
 * `onInstallExtensionRequested`, main/ipc.ts) plutôt que vers le vrai binaire
 * Chrome (qu'on n'a pas). Reconstitution d'une API non documentée : peut
 * cesser de fonctionner si Google change son code — `ensureStoreShim`
 * (ci-dessous) réinjecte à CHAQUE navigation qualifiante plutôt qu'une seule
 * fois, pour rester résilient si le crochet se perd d'une manière ou d'une
 * autre (ex. rechargement de la page).
 */
const WEBSTORE_HOOK_SCRIPT = `(() => {
  if (window.__aetherStoreShimActive) return
  window.__aetherStoreShimActive = true

  const uaChromeVersion = () => {
    const ua = navigator.userAgent
    const idx = ua.indexOf('Chrome/')
    if (idx === -1) return '131.0.0.0'
    const rest = ua.slice(idx + 7)
    const end = rest.indexOf(' ')
    return end === -1 ? rest : rest.slice(0, end)
  }

  try {
    const existing = navigator.userAgentData
    const version = uaChromeVersion().split('.')[0]
    const brands = [
      ...((existing && existing.brands) || []).filter((b) => b.brand !== 'Google Chrome'),
      { brand: 'Google Chrome', version }
    ]
    const fakeData = {
      brands,
      mobile: existing ? existing.mobile : false,
      platform: existing ? existing.platform : 'Windows',
      getHighEntropyValues:
        existing && existing.getHighEntropyValues
          ? existing.getHighEntropyValues.bind(existing)
          : () => Promise.resolve({ brands, mobile: false, platform: 'Windows' })
    }
    Object.defineProperty(navigator, 'userAgentData', { get: () => fakeData, configurable: true })
  } catch (_e) {
    // navigateur/version sans Client Hints — sans conséquence, le reste fonctionne quand même.
  }

  const extractId = () => {
    const parts = location.pathname.split('/')
    for (const p of parts) {
      if (p.length === 32 && /^[a-p]+$/.test(p)) return p
    }
    return null
  }

  const scrapeMeta = () => {
    let name = document.title || 'Extension'
    const seps = [' - Chrome Web Store', ' – Chrome Web Store', ' — Chrome Web Store']
    for (const sep of seps) {
      const idx = name.indexOf(sep)
      if (idx > 0) { name = name.slice(0, idx); break }
    }
    name = name.trim() || 'Extension'
    const iconEl = document.querySelector('img[src*="googleusercontent.com"]')
    return { name, iconUrl: iconEl ? iconEl.src : null }
  }

  // Extensions installées AVEC SUCCÈS pendant la vie de ce document — permet à
  // getExtensionStatus (interrogée par la page pour décider le libellé du
  // bouton, « Ajouter »/« Supprimer ») de refléter un succès qu'on vient tout
  // juste d'accomplir. Ne survit pas à un rechargement de page (pas de canal
  // pour re-semer cette info au tout début du prochain document) — limite
  // connue, cf. mémoire du projet.
  const installedIds = new Set()
  const signalConfirm = (id, name, iconUrl) => {
    document.title =
      '${INSTALL_CONFIRM_PREFIX}' + id + ':' + encodeURIComponent(name) + ':' + encodeURIComponent(iconUrl || '') + ':' + Date.now()
  }

  // Marque une extension installée une fois l'utilisateur confirmé dans la
  // vraie popup ÆTHER — seul canal main vers page possible ici, executeJavaScript
  // ne demande aucun bridge côté page (contrairement à page vers main, réduit à
  // document.title, cf. commentaire au-dessus). Ne pilote plus les callbacks
  // begin/completeInstall (voir plus bas pourquoi).
  window.__aetherResolveInstall = (id, ok) => {
    if (ok) installedIds.add(id)
  }

  window.chrome = window.chrome || {}
  window.chrome.webstorePrivate = {
    getExtensionStatus: (id, _manifest, cb) => cb && cb(installedIds.has(id || extractId()) ? 'installed' : 'installable'),
    getBrowserLogin: (cb) => cb && cb({ login: '' }),
    getStoreLogin: (cb) => cb && cb(''),
    isInIncognitoMode: (cb) => cb && cb(false),
    isPendingCustodianApproval: (_id, cb) => cb && cb(false),
    getReferrerChain: (cb) => cb && cb(''),
    getFullChromeVersion: (cb) => cb && cb({ version_number: uaChromeVersion() }),
    getWebGLStatus: (cb) => cb && cb('webgl_allowed'),
    getIsLauncherEnabled: (cb) => cb && cb(false),
    // Résolus IMMÉDIATEMENT (pas d'attente du vrai clic utilisateur dans notre
    // popup) : le vrai Chrome répond vite car sa boîte de dialogue native est
    // bloquante au niveau du navigateur lui-même — la nôtre, une fenêtre
    // séparée pilotée par IPC, ne peut pas garantir la même latence. Attendre
    // la confirmation réelle ici a fait dépasser un délai interne du Store
    // (constaté : sa propre « Erreur de téléchargement » s'affichait malgré
    // une installation qui aboutissait quand même). La vraie confirmation
    // reste posée par notre popup (signalConfirm) — elle décide seule si le
    // téléchargement RÉEL a lieu, indépendamment de ce que la page en pense.
    beginInstallWithManifest3: (details, cb) => {
      const id = (details && details.id) || extractId()
      if (!id) { cb && cb('invalid_id'); return }
      let name = null
      let iconUrl = (details && details.iconUrl) || null
      try {
        if (details && details.manifest) name = JSON.parse(details.manifest).name || null
      } catch (_e) { /* manifest non exploitable — repli sur le DOM ci-dessous */ }
      const meta = scrapeMeta()
      if (!name || name.indexOf('__MSG_') === 0) name = meta.name
      iconUrl = iconUrl || meta.iconUrl
      signalConfirm(id, name, iconUrl)
      cb && cb({ installId: id, result: 'success' })
    },
    completeInstall: (_id, cb) => { cb && cb() },
    install: (id, _opts, cb) => {
      const meta = scrapeMeta()
      signalConfirm(id, meta.name, meta.iconUrl)
      cb && cb()
    }
  }

})()`

function stepZoom(current: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    return ZOOM_STEPS.find((s) => s > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  }
  return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? ZOOM_STEPS[0]
}

/** Instantané d'une page fermée, pour permettre de la rouvrir (par profil). */
export interface ClosedPageSnapshot {
  spaceId: SpaceId
  url: string
  parentId: string | null
  canvas: { x: number; y: number; w: number; h: number }
}
const MAX_CLOSED_HISTORY = 8

export interface PageRuntime {
  isLive: boolean
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  loadError: string | null
}

export interface ViewManagerDelegate {
  /** Métadonnées/état d'une page modifiés → notifier le renderer. */
  onMetaChanged(pageId: PageId): void
  /** Nouvel aperçu disponible. */
  onPreviewUpdated(pageId: PageId, version: number): void
  /** La page demande l'ouverture d'une nouvelle page (window.open, menu…). */
  onOpenRequest(sourcePageId: PageId, url: string): void
  /** Raccourci clavier applicatif déclenché depuis une page web. */
  onShortcut(cmd: ShortcutCommand): void
  /** La page entre/sort du plein écran HTML5 (vidéo…). */
  onFullscreenChange(pageId: PageId, isFullscreen: boolean): void
  /** La page (vue native) vient de recevoir le focus — un clic dedans, par ex.
   * Les clics sur une WebContentsView n'atteignent jamais le DOM du renderer
   * hôte : c'est le seul signal fiable pour fermer un popover local ouvert. */
  onPageFocused(pageId: PageId): void
  /** Texte de la page extrait (pour les embeddings). */
  onTextExtracted(pageId: PageId, text: string): void
  /** Niveau de zoom de la page modifié (Ctrl+±/0 ou Ctrl+molette) — pourcentage arrondi. */
  onZoomChanged(pageId: PageId, percent: number): void
  /** Une page a fini de charger (pour journaliser l'historique). */
  onVisit(pageId: PageId, url: string, title: string): void
  /** Résultat d'une recherche dans la page (barre de recherche locale, Ctrl+F). */
  onFindResult(pageId: PageId, matches: number, activeMatchOrdinal: number): void
  /** Installation proposée depuis le Chrome Web Store (vrai bouton ou bouton de
   * secours ÆTHER) — le délégué doit demander confirmation avant d'installer. */
  onInstallExtensionRequested(pageId: PageId, extensionId: string, name: string, iconUrl: string | null): void
}

export class ViewManager {
  private views = new Map<PageId, WebContentsView>()
  private runtime = new Map<PageId, PageRuntime>()
  /** Chargement initial encore en vol pour une vue tout juste créée (voir
   * `ensureLive`) — `navigate()` attend sa fin avant de lancer le sien.
   * Sans ça, un nouvel onglet suivi d'une recherche quasi immédiate (le champ
   * de NewTabPage.tsx n'attend aucun focus manuel) pouvait lancer un DEUXIÈME
   * `loadURL` alors que le premier (`aether://newtab`) n'avait pas fini de
   * s'engager dans l'historique de navigation — Chromium annule alors la
   * navigation en cours au profit de la nouvelle, et `aether://newtab`
   * n'entrait JAMAIS dans l'historique : le bouton « retour » n'avait ensuite
   * rien vers quoi revenir. */
  private pendingInitialLoad = new Map<PageId, Promise<void>>()
  private bounds = new Map<PageId, Bounds>()
  private attached = new Set<PageId>()
  private visibleIds: PageId[] = []
  private overlayOpen = false
  /** Ordre d'utilisation (fin = plus récent) pour l'éviction LRU. */
  private lru: PageId[] = []
  /** Profil actif : détermine la partition (session isolée) des nouvelles vues. */
  private activeProfileId = ''
  private activeProfilePrivate = false
  /** Dernières pages fermées (fin = plus récente), pour « Rouvrir ». */
  private closedStack: ClosedPageSnapshot[] = []
  /**
   * Pages dont le PROCHAIN événement `focus` du WebContents doit être ignoré
   * (voir `untranslate` : un `reload()` déclenché depuis le popup de
   * traduction redonne le focus à la page une fois chargée, ce qui est
   * indiscernable d'un vrai clic utilisateur dans la page — et fermait donc
   * à tort le popup de traduction, comme si l'utilisateur avait cliqué
   * ailleurs). Auto-nettoyé après un court délai si le focus ne revient
   * jamais (page qui échoue à charger).
   */
  private suppressNextFocusHide = new Map<PageId, ReturnType<typeof setTimeout>>()
  /** Pages sur lesquelles le crochet Chrome Web Store (CDP + shim) est actuellement posé. */
  private storeShimHosts = new Set<PageId>()
  /** Identifiant CDP du dernier script enregistré par page — pour le retirer
   * avant d'en enregistrer un nouveau (évite l'accumulation sur rechargements). */
  private storeShimScriptIds = new Map<PageId, string>()

  constructor(
    private win: BrowserWindow,
    private delegate: ViewManagerDelegate
  ) {}

  // ─── État runtime ──────────────────────────────────────────────────────────

  getRuntime(pageId: PageId): PageRuntime {
    return (
      this.runtime.get(pageId) ?? {
        isLive: false,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        loadError: null
      }
    )
  }

  private patchRuntime(pageId: PageId, patch: Partial<PageRuntime>): void {
    this.runtime.set(pageId, { ...this.getRuntime(pageId), ...patch })
    this.delegate.onMetaChanged(pageId)
  }

  private touchLru(pageId: PageId): void {
    const idx = this.lru.indexOf(pageId)
    if (idx >= 0) this.lru.splice(idx, 1)
    this.lru.push(pageId)
  }

  // ─── Profil actif ────────────────────────────────────────────────────────

  /** Fixe le profil dont la partition (session isolée) sert aux nouvelles vues. */
  setActiveProfile(profileId: ProfileId, isPrivate: boolean): void {
    this.activeProfileId = profileId
    this.activeProfilePrivate = isPrivate
    ensurePartitionHardened(webPartitionForProfile(profileId, isPrivate), profileId, this.win)
  }

  activePartition(): string {
    return webPartitionForProfile(this.activeProfileId, this.activeProfilePrivate)
  }

  // ─── Cycle de vie des vues ─────────────────────────────────────────────────

  /** Garantit qu'une vue vivante existe pour la page (création paresseuse). */
  ensureLive(row: PageRow): WebContentsView {
    const existing = this.views.get(row.id)
    if (existing && !existing.webContents.isDestroyed()) {
      this.touchLru(row.id)
      return existing
    }

    const partition = this.activePartition()
    ensurePartitionHardened(partition, this.activeProfileId, this.win)
    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        safeDialogs: true,
        spellcheck: getSettings().spellcheck
      }
    })
    view.setBackgroundColor('#0a0a10')
    // Coins arrondis natifs si l'API existe (Electron ≥ 36) — amélioration progressive.
    const v = view as unknown as { setBorderRadius?: (r: number) => void }
    v.setBorderRadius?.(10)

    view.webContents.setAudioMuted(Boolean(row.muted))

    this.views.set(row.id, view)
    this.runtime.set(row.id, {
      isLive: true,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      loadError: null
    })
    this.touchLru(row.id)
    this.wire(row.id, view.webContents)
    // Même `aether://newtab` est vraiment chargé (protocole `aether:` sert un
    // document minimal pour cet hôte) — PageSlot.tsx masque cette vue derrière
    // NewTabPage (composant React), mais un VRAI chargement est nécessaire
    // pour que Chromium inscrive une entrée d'historique : sans elle, le
    // bouton « retour » ne peut jamais revenir à cette page après avoir
    // recherché/navigué ailleurs depuis le nouvel onglet.
    this.syncStoreShim(row.id, view.webContents, row.url)
    const initialLoad = view.webContents.loadURL(row.url).catch(() => undefined)
    this.pendingInitialLoad.set(row.id, initialLoad)
    void initialLoad.then(() => {
      if (this.pendingInitialLoad.get(row.id) === initialLoad) this.pendingInitialLoad.delete(row.id)
    })
    this.evictIfNeeded()
    this.delegate.onMetaChanged(row.id)
    return view
  }

  /** Coupe/rétablit le son d'une page (persisté, réappliqué à la réhydratation). */
  toggleMute(id: PageId): void {
    const row = pagesRepo.get(id)
    if (!row) return
    const next = !row.muted
    pagesRepo.setMuted(id, next)
    this.views.get(id)?.webContents.setAudioMuted(next)
    this.delegate.onMetaChanged(id)
  }

  /** Mémoire (Ko) du processus hébergeant cette page, ou null si non mesurable. */
  getMemoryKB(id: PageId): number | null {
    const wc = this.liveContents(id)
    if (!wc) return null
    try {
      const pid = wc.getOSProcessId()
      const metric = app.getAppMetrics().find((m) => m.pid === pid)
      return metric?.memory.workingSetSize ?? null
    } catch {
      return null
    }
  }

  /** Câble tous les événements d'une page web. */
  private wire(pageId: PageId, wc: WebContents): void {
    const nav = wc.navigationHistory

    wc.on('page-title-updated', (_e, title) => {
      // Faille corrigée : `document.title` est modifiable par N'IMPORTE QUELLE
      // page (une seule ligne de JS, aucun privilège requis) — sans cette
      // garde, un site quelconque (pas forcément le Store) pouvait usurper
      // notre PROPRE popup native de confirmation d'installation avec un nom/
      // icône de son choix, pour un identifiant d'extension arbitraire (y
      // compris une vraie extension légitime choisie pour que le téléchargement
      // réussisse), trompant l'utilisateur sur ce qu'il installe réellement.
      // `storeShimHosts` (déjà tenu à jour par `syncStoreShim`) restreint ce
      // canal aux pages actuellement sur le VRAI Chrome Web Store, exactement
      // comme l'injection du shim `WEBSTORE_HOOK_SCRIPT` elle-même.
      if (title.startsWith(INSTALL_CONFIRM_PREFIX) && this.storeShimHosts.has(pageId)) {
        const [extensionId, encName, encIconUrl] = title.slice(INSTALL_CONFIRM_PREFIX.length).split(':')
        const name = decodeURIComponent(encName || '') || 'Extension'
        const iconUrl = decodeURIComponent(encIconUrl || '') || null
        this.delegate.onInstallExtensionRequested(pageId, extensionId, name, iconUrl)
        return
      }
      pagesRepo.updateTitle(pageId, title)
      this.delegate.onMetaChanged(pageId)
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      const icon = favicons.find((f) => f.startsWith('https://') || f.startsWith('http://'))
      pagesRepo.updateFavicon(pageId, icon ?? null)
      this.delegate.onMetaChanged(pageId)
    })

    const onNavigated = (url: string): void => {
      if (pagesRepo.get(pageId)) pagesRepo.updateNavigation(pageId, url)
      this.patchRuntime(pageId, {
        canGoBack: nav.canGoBack(),
        canGoForward: nav.canGoForward()
      })
      // Couvre les cas non passés par `ensureLive`/`navigate` (redirections,
      // navigation SPA in-page à l'intérieur du Store) et le démontage du
      // crochet en quittant le Store — `will-navigate` ci-dessous couvre déjà
      // le cas le plus courant (lien cliqué), en amont du chargement réel.
      this.syncStoreShim(pageId, wc, url)
    }
    wc.on('did-navigate', (_e, url) => onNavigated(url))
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) onNavigated(url)
    })

    wc.on('did-start-loading', () => {
      this.patchRuntime(pageId, { isLoading: true, loadError: null })
    })

    wc.on('did-stop-loading', () => {
      this.patchRuntime(pageId, {
        isLoading: false,
        canGoBack: nav.canGoBack(),
        canGoForward: nav.canGoForward()
      })
      // `aether://…` (nouvel onglet) : jamais un vrai site — ni un historique
      // de navigation (polluait la liste « récemment visités » du champ de
      // recherche avec des entrées vides/« Nouvel onglet »), ni un aperçu
      // (page masquée derrière un composant React, rien à capturer), ni une
      // extraction de texte (document minimal, sans contenu réel).
      const url = wc.getURL()
      if (url.startsWith('aether:')) return
      // Laisse la page peindre, puis capture l'aperçu + extrait le texte.
      setTimeout(() => {
        void this.capture(pageId, true)
        void this.extractText(pageId)
      }, 450)
      this.delegate.onVisit(pageId, url, wc.getTitle())
    })

    // Zoom par défaut réappliqué à chaque page (le facteur se réinitialise
    // entre origines — comme le « zoom par défaut » des réglages de Chrome).
    wc.on('dom-ready', () => {
      wc.setZoomFactor(getSettings().defaultZoom)
    })

    // Notifie le renderer du niveau de zoom réel (pourcentage) — affiché
    // brièvement à l'écran, cf `onZoomChanged`.
    const reportZoom = (): void => {
      this.delegate.onZoomChanged(pageId, Math.round(wc.getZoomFactor() * 100))
    }

    // Ctrl+molette : Electron notifie le geste mais n'applique rien tout
    // seul (contrairement à Ctrl+±, un vrai raccourci clavier) — il faut
    // ajuster le niveau de zoom nous-même dans ce handler.
    wc.on('zoom-changed', (_e, zoomDirection) => {
      wc.setZoomFactor(stepZoom(wc.getZoomFactor(), zoomDirection))
      reportZoom()
    })

    wc.on('found-in-page', (_e, result) => {
      this.delegate.onFindResult(pageId, result.matches, result.activeMatchOrdinal)
    })

    wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return // -3 = navigation annulée, bénin
      this.patchRuntime(pageId, {
        isLoading: false,
        loadError: description || `Erreur ${code}`
      })
    })

    wc.on('enter-html-full-screen', () => this.delegate.onFullscreenChange(pageId, true))
    wc.on('leave-html-full-screen', () => this.delegate.onFullscreenChange(pageId, false))

    wc.on('focus', () => {
      const timer = this.suppressNextFocusHide.get(pageId)
      if (timer !== undefined) {
        clearTimeout(timer)
        this.suppressNextFocusHide.delete(pageId)
        return
      }
      this.delegate.onPageFocused(pageId)
    })

    wc.on('render-process-gone', () => {
      this.destroyView(pageId, { keepPreview: true })
      this.patchRuntime(pageId, {
        isLive: false,
        isLoading: false,
        loadError: 'Le processus de la page a été interrompu.'
      })
    })

    // Les ouvertures de fenêtres deviennent des cartes dans l'espace courant.
    wc.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        this.delegate.onOpenRequest(pageId, url)
      }
      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      // Posé/retiré ICI, avant le chargement réel — le crochet doit être
      // enregistré via CDP AVANT que le document du Store ne s'exécute.
      this.syncStoreShim(pageId, wc, url)
      if (url.startsWith('mailto:') || url.startsWith('tel:')) {
        event.preventDefault()
        void shell.openExternal(url)
        return
      }
      // Une page qui tente d'aller sur chrome://settings|flags|help → on ouvre
      // l'équivalent ÆTHER plutôt que de charger une page qui n'existe pas.
      const route = resolveInternalRoute(url)
      if (route) {
        event.preventDefault()
        this.delegate.onShortcut(route.kind)
      }
    })

    // Raccourcis globaux même quand une page web a le focus clavier.
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = input.control || input.meta
      const key = input.key.toLowerCase()
      const forward = (cmd: ShortcutCommand): void => {
        event.preventDefault()
        this.delegate.onShortcut(cmd)
      }
      if (ctrl && (key === 'k' || key === 't' || key === 'l')) return forward('intention')
      if (ctrl && key === 'e') return forward('toggle-mode')
      if (ctrl && key === 'b') return forward('toggle-constellation')
      if (ctrl && key === 'j') return forward('toggle-muse')
      if (ctrl && key === 'w') return forward('close-page')
      if (ctrl && key === ',') return forward('settings')
      if (input.key === 'F1') return forward('guide')
      if (input.key === 'F11') return forward('fullscreen')
      if (ctrl && input.shift && key === 'n') return forward('private-window')
      if (ctrl && input.shift && input.key === 'Delete') return forward('clear-data')
      if (ctrl && input.shift && key === 'a') return forward('tab-search')
      if (ctrl && key === 'p') return forward('print')
      if (ctrl && key === 's') return forward('save-page')
      if (ctrl && key === 'f') return forward('find-in-page')
      if ((ctrl && key === 'r') || input.key === 'F5') {
        event.preventDefault()
        wc.reload()
        return
      }
      if (input.alt && input.key === 'ArrowLeft') {
        event.preventDefault()
        if (nav.canGoBack()) nav.goBack()
        return
      }
      if (input.alt && input.key === 'ArrowRight') {
        event.preventDefault()
        if (nav.canGoForward()) nav.goForward()
        return
      }
      if (ctrl && (key === '=' || key === '+')) {
        event.preventDefault()
        wc.setZoomFactor(stepZoom(wc.getZoomFactor(), 'in'))
        reportZoom()
        return
      }
      if (ctrl && key === '-') {
        event.preventDefault()
        wc.setZoomFactor(stepZoom(wc.getZoomFactor(), 'out'))
        reportZoom()
        return
      }
      if (ctrl && key === '0') {
        event.preventDefault()
        wc.setZoomFactor(1)
        reportZoom()
        return
      }
      if (input.key === 'F12') {
        event.preventDefault()
        this.teardownStoreShim(pageId, wc)
        wc.openDevTools({ mode: 'detach' })
      }
    })

    // Menu contextuel minimal, volontairement sobre — bulle DOM (voir
    // showContextMenuPopover/ContextMenuPopoverCard), pas un `Menu.buildFromTemplate`
    // natif, pour la même raison que les autres menus contextuels de l'appli
    // (positionnement précis impossible à garantir sur un menu natif). La
    // fenêtre popup flottante compose déjà au-dessus de toute page vivante
    // (fenêtre séparée, cf. l'en-tête de ce fichier), donc pas de souci ici.
    wc.on('context-menu', (_e, params) => {
      const rows: ContextMenuRow[] = []
      const actions: Record<string, () => void> = {}
      if (params.linkURL) {
        rows.push(
          { kind: 'item', id: 'open-link', label: 'Ouvrir dans une nouvelle carte' },
          { kind: 'item', id: 'copy-link', label: "Copier l'adresse du lien" },
          { kind: 'separator' }
        )
        actions['open-link'] = () => this.delegate.onOpenRequest(pageId, params.linkURL)
        actions['copy-link'] = () => clipboard.writeText(params.linkURL)
      }
      if (params.selectionText) {
        rows.push({ kind: 'item', id: 'copy', label: 'Copier' }, { kind: 'separator' })
        actions.copy = () => wc.copy()
      }
      if (params.isEditable) {
        rows.push({ kind: 'item', id: 'cut', label: 'Couper' }, { kind: 'item', id: 'paste', label: 'Coller' }, { kind: 'separator' })
        actions.cut = () => wc.cut()
        actions.paste = () => wc.paste()
      }
      rows.push(
        { kind: 'item', id: 'back', label: 'Retour', disabled: !nav.canGoBack() },
        { kind: 'item', id: 'forward', label: 'Avancer', disabled: !nav.canGoForward() },
        { kind: 'item', id: 'reload', label: 'Recharger' },
        { kind: 'separator' },
        { kind: 'item', id: 'copy-page-url', label: "Copier l'adresse de la page" },
        { kind: 'item', id: 'inspect', label: 'Inspecter' }
      )
      actions.back = () => nav.goBack()
      actions.forward = () => nav.goForward()
      actions.reload = () => wc.reload()
      actions['copy-page-url'] = () => clipboard.writeText(wc.getURL())
      actions.inspect = () => {
        this.teardownStoreShim(pageId, wc)
        wc.openDevTools({ mode: 'detach' })
      }

      const viewBounds = this.bounds.get(pageId)
      const anchor = { x: (viewBounds?.x ?? 0) + params.x, y: (viewBounds?.y ?? 0) + params.y, width: 0, height: 0 }
      showContextMenuPopover(this.win, anchor, rows, actions)

      // Le détecteur global de clic-extérieur (App.tsx) tourne dans la fenêtre
      // PRINCIPALE — un clic dans CETTE page ne l'atteint jamais (surface
      // native séparée). Et `onPageFocused` (wc.on('focus')) ne se redéclenche
      // pas si la page avait déjà le focus (cas typique d'un clic droit dessus),
      // donc un clic ailleurs sur la MÊME page ne fermait jamais la bulle.
      // Electron n'expose aucun évènement générique « clic sur cette page »
      // côté main (seul `before-input-event`, clavier uniquement) — on injecte
      // donc un détecteur ponctuel DANS la page elle-même, dont la promesse
      // ne se résout qu'au premier clic, pour fermer la bulle à ce moment-là.
      void wc
        .executeJavaScript(
          `new Promise((resolve) => {
             const handler = () => { document.removeEventListener('mousedown', handler, true); resolve(true) }
             document.addEventListener('mousedown', handler, true)
           })`,
          true
        )
        .then(() => hidePopoverWindow())
        .catch(() => {})
    })
  }

  // ─── Disposition (mode Focus) ──────────────────────────────────────────────

  /** Déclare l'ensemble des pages visibles (0, 1 ou 2 en split). */
  setVisible(ids: PageId[]): void {
    // Capture opportuniste des pages qui quittent l'écran.
    for (const id of this.visibleIds) {
      if (!ids.includes(id)) void this.capture(id, true)
    }
    this.visibleIds = ids
    for (const id of ids) {
      const row = pagesRepo.get(id)
      if (row) {
        this.ensureLive(row)
        this.touchLru(id)
      }
    }
    this.applyLayout()
    this.evictIfNeeded()
  }

  setBounds(id: PageId, b: Bounds): void {
    this.bounds.set(id, b)
    // Toujours repasser par `applyLayout()` (pas un `view.setBounds()` direct) :
    // une vue qui reçoit ses PREMIÈRES bornes (ex. nouvel onglet qui vient de
    // naviguer vers une vraie URL) n'est pas encore attachée au `contentView`
    // de la fenêtre — seul `applyLayout()` gère l'attache ET les bornes.
    this.applyLayout()
  }

  /** Un overlay UI (intention, réglages…) recouvre la zone web. */
  setOverlay(open: boolean): void {
    if (this.overlayOpen === open) return
    if (open) {
      for (const id of this.visibleIds) void this.capture(id, true)
    }
    this.overlayOpen = open
    this.applyLayout()
  }

  private sanitize(b: Bounds): Bounds {
    return {
      x: Math.max(0, Math.round(b.x)),
      y: Math.max(0, Math.round(b.y)),
      width: Math.max(0, Math.round(b.width)),
      height: Math.max(0, Math.round(b.height))
    }
  }

  private applyLayout(): void {
    for (const [id, view] of this.views) {
      const shouldShow = !this.overlayOpen && this.visibleIds.includes(id) && this.bounds.has(id)
      if (shouldShow) {
        if (!this.attached.has(id)) {
          this.win.contentView.addChildView(view)
          this.attached.add(id)
        }
        view.setBounds(this.sanitize(this.bounds.get(id) as Bounds))
        view.setVisible(true)
      } else if (this.attached.has(id)) {
        view.setVisible(false)
      }
    }
  }

  /** Décharge les vues les moins récentes au-delà du plafond (économiseur de mémoire). */
  private evictIfNeeded(): void {
    const max = Math.max(this.visibleIds.length, getSettings().maxLivePages)
    const liveCount = this.views.size
    if (liveCount <= max) return
    const candidates = this.lru.filter((id) => !this.visibleIds.includes(id))
    let toEvict = liveCount - max
    for (const id of candidates) {
      if (toEvict <= 0) break
      this.destroyView(id, { keepPreview: true })
      this.patchRuntime(id, { isLive: false, isLoading: false })
      toEvict--
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  private liveContents(id: PageId): WebContents | null {
    const view = this.views.get(id)
    if (!view || view.webContents.isDestroyed()) return null
    return view.webContents
  }

  /** Exécute un script dans la page si elle est encore vivante — seul canal
   * main→page possible pour une WebContentsView sans preload/contextBridge
   * (voir `__aetherResolveInstall`, WEBSTORE_HOOK_SCRIPT ci-dessus). */
  runScript(id: PageId, script: string): void {
    void this.liveContents(id)?.executeJavaScript(script).catch(() => {})
  }

  /** Pose ou retire le crochet Chrome Web Store selon l'hôte de destination —
   * appelé PROACTIVEMENT avant chaque `loadURL` (ensureLive/navigate) pour que
   * le script soit enregistré via CDP AVANT que le document ne se charge, et
   * aussi sur chaque navigation détectée (will-navigate/did-navigate) pour
   * couvrir les cas non déclenchés par ces deux points d'entrée (liens cliqués
   * dans la page, redirections, actualisation). RÉ-ENREGISTRÉ à CHAQUE appel —
   * PAS idempotent volontairement : un rechargement de page a été observé
   * faire réapparaître le bouton grisé de Google, signe que le crochet peut se
   * perdre silencieusement d'une manière ou d'une autre. Ré-attacher/
   * ré-enregistrer à chaque fois coûte peu et élimine toute cette classe de
   * bug plutôt que de dépendre d'un diagnostic précis de la cause exacte. */
  private syncStoreShim(pageId: PageId, wc: WebContents, url: string): void {
    if (isStoreHost(url)) this.ensureStoreShim(pageId, wc)
    else this.teardownStoreShim(pageId, wc)
  }

  private ensureStoreShim(pageId: PageId, wc: WebContents): void {
    this.storeShimHosts.add(pageId)
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      const oldScriptId = this.storeShimScriptIds.get(pageId)
      const reattach = (): void => {
        void wc.debugger
          .sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: WEBSTORE_HOOK_SCRIPT })
          .then((result) => {
            const identifier = (result as { identifier?: string } | undefined)?.identifier
            if (identifier) this.storeShimScriptIds.set(pageId, identifier)
          })
          .catch(() => {})
      }
      // Retire l'ancien script avant d'en ajouter un neuf — sinon une longue
      // session avec plusieurs rechargements accumule des copies redondantes
      // (sans rien casser — le script est idempotent par document via son
      // garde interne — mais inutilement).
      if (oldScriptId) {
        void wc.debugger
          .sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: oldScriptId })
          .catch(() => {})
          .then(reattach)
      } else {
        reattach()
      }
    } catch {
      // CDP indisponible (DevTools déjà ouverts sur cette page…) — le rattrapage
      // executeJavaScript ci-dessous reste le seul mécanisme pour ce chargement.
    }
    // Rattrapage pour le document COURANT (le CDP ci-dessus ne s'applique qu'aux
    // PROCHAINS documents) — sans effet au tout premier chargement (trop tard),
    // mais gratuit et sans risque à réappliquer.
    void wc.executeJavaScript(WEBSTORE_HOOK_SCRIPT).catch(() => {})
  }

  private teardownStoreShim(pageId: PageId, wc: WebContents): void {
    if (!this.storeShimHosts.has(pageId)) return
    this.storeShimHosts.delete(pageId)
    this.storeShimScriptIds.delete(pageId)
    try {
      if (wc.debugger.isAttached()) wc.debugger.detach()
    } catch {
      // Déjà détaché (ex. page fermée entretemps) — sans conséquence.
    }
  }

  async navigate(id: PageId, url: string): Promise<void> {
    const row = pagesRepo.get(id)
    if (!row) return
    pagesRepo.updateNavigation(id, url)
    const view = this.ensureLive({ ...row, url })
    // Si CETTE vue vient tout juste d'être créée (ex. nouvel onglet suivi
    // d'une recherche quasi immédiate), attend que son tout premier
    // chargement se soit réellement engagé avant de lancer le nôtre — sinon
    // Chromium annule la navigation en cours au profit de la nouvelle et le
    // premier chargement n'entre jamais dans l'historique (cf. commentaire
    // sur `pendingInitialLoad`).
    await this.pendingInitialLoad.get(id)
    if (!this.views.has(id) || this.views.get(id) !== view) return
    this.syncStoreShim(id, view.webContents, url)
    void view.webContents.loadURL(url).catch(() => undefined)
    this.patchRuntime(id, { loadError: null })
  }

  goBack(id: PageId): void {
    const wc = this.liveContents(id)
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  goForward(id: PageId): void {
    const wc = this.liveContents(id)
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  reload(id: PageId): void {
    const wc = this.liveContents(id)
    if (wc) {
      wc.reload()
    } else {
      const row = pagesRepo.get(id)
      if (row) this.ensureLive(row) // réhydratation d'une page déchargée
    }
  }

  stop(id: PageId): void {
    this.liveContents(id)?.stop()
  }

  openDevtools(id: PageId): void {
    // Un client CDP (notre crochet Store) et les DevTools ne peuvent pas coexister
    // sur le même WebContents — on cède la place aux DevTools si demandées.
    const wc = this.liveContents(id)
    if (wc) this.teardownStoreShim(id, wc)
    this.liveContents(id)?.openDevTools({ mode: 'detach' })
  }

  /** Réapplique le zoom par défaut à toutes les vues vivantes (réglage modifié). */
  applyZoomToAll(): void {
    const factor = getSettings().defaultZoom
    for (const view of this.views.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(factor)
    }
  }

  /** Zoom déclenché depuis le menu principal (même logique que Ctrl+±/0 au clavier). */
  zoom(id: PageId, direction: 'in' | 'out' | 'reset'): void {
    const wc = this.liveContents(id)
    if (!wc) return
    if (direction === 'reset') wc.setZoomFactor(1)
    else wc.setZoomFactor(stepZoom(wc.getZoomFactor(), direction))
    this.delegate.onZoomChanged(id, Math.round(wc.getZoomFactor() * 100))
  }

  print(id: PageId): void {
    this.liveContents(id)?.print()
  }

  copy(id: PageId): void {
    this.liveContents(id)?.copy()
  }

  paste(id: PageId): void {
    this.liveContents(id)?.paste()
  }

  cut(id: PageId): void {
    this.liveContents(id)?.cut()
  }

  /** Enregistre la page (HTML complet) via un sélecteur d'emplacement natif. */
  async savePage(id: PageId): Promise<void> {
    const wc = this.liveContents(id)
    const row = pagesRepo.get(id)
    if (!wc || !row) return
    const defaultName = (row.title || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
    const { canceled, filePath } = await dialog.showSaveDialog(this.win, {
      defaultPath: `${defaultName}.html`,
      filters: [{ name: 'Page web complète', extensions: ['html'] }]
    })
    if (canceled || !filePath) return
    await wc.savePage(filePath, 'HTMLComplete')
  }

  /** Capture la vue actuelle de la page et propose de l'enregistrer en PNG. */
  async captureScreenshot(id: PageId): Promise<void> {
    const wc = this.liveContents(id)
    if (!wc) return
    const image = await wc.capturePage()
    const { canceled, filePath } = await dialog.showSaveDialog(this.win, {
      defaultPath: 'capture.png',
      filters: [{ name: 'Image PNG', extensions: ['png'] }]
    })
    if (canceled || !filePath) return
    await writeFile(filePath, image.toPNG())
  }

  /** Recherche dans la page (barre locale, Ctrl+F) — résultat via l'événement `found-in-page`. */
  findInPage(id: PageId, text: string, opts: { forward: boolean; findNext: boolean }): void {
    const wc = this.liveContents(id)
    if (!wc) return
    if (!text) {
      wc.stopFindInPage('clearSelection')
      return
    }
    wc.findInPage(text, { forward: opts.forward, findNext: opts.findNext })
  }

  stopFindInPage(id: PageId, action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void {
    this.liveContents(id)?.stopFindInPage(action)
  }

  /**
   * Traduit la page EN PLACE, SANS le widget « Google Website Translator »
   * (abandonné après 3 correctifs infructueux — voir mémoire du projet) :
   * ce widget injecte sa propre bannière dans la page, et celle-ci s'est
   * révélée porter une partie de la logique interne du widget — la masquer
   * (CSS ou style forcé) casse soit la traduction, soit reste visible malgré
   * tout (Google la réaffiche lui-même en continu). Deux agents de recherche
   * dédiés ont confirmé que ce combo bannière/traduction est intentionnellement
   * difficile à séparer et recommandé une ré-implémentation complète.
   *
   * Nouvelle approche, 100 % maison, RIEN de Google n'est jamais injecté dans
   * la page (donc AUCUNE bannière possible, structurellement) :
   *  1. parcourt les nœuds de texte visibles du DOM (`TreeWalker`, en
   *     ignorant script/style/code/formulaires/contenteditable) ;
   *  2. les regroupe en lots, chaque nœud sur sa propre ligne, et interroge
   *     l'API publique `translate_a/single` (même service que le widget,
   *     mais SANS son JS/UI — juste un endpoint JSON) ;
   *  3. reconstruit la traduction par nœud : Google peut re-découper une
   *     ligne en plusieurs phrases dans sa réponse, donc on recolle les
   *     segments jusqu'à ce que le texte ORIGINAL d'un segment se termine
   *     par `\n` (frontière de ligne fiable, vérifiée empiriquement) ;
   *  4. remplace `textContent` des nœuds correspondants, sans toucher à la
   *     structure du DOM.
   * L'échec d'un lot (réseau, CSP du site qui bloque `fetch`) est silencieux
   * et n'affecte que ce lot — jamais de bannière d'erreur, conformément à
   * la demande explicite de l'utilisateur.
   */
  translate(id: PageId, targetLang: string, sourceLang = 'auto'): void {
    const wc = this.liveContents(id)
    if (!wc) return
    const lang = JSON.stringify(targetLang)
    const srcLang = JSON.stringify(sourceLang || 'auto')
    void wc.executeJavaScript(
      `(async () => {
        // Repart toujours du texte ORIGINAL (pas de la traduction précédente,
        // sinon changer de langue cible traduirait une traduction déjà faite).
        if (window.__aetherOriginalHTML !== undefined) {
          document.body.innerHTML = window.__aetherOriginalHTML
        } else {
          window.__aetherOriginalHTML = document.body.innerHTML
        }

        const SKIP_TAGS = new Set([
          'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
          'IFRAME', 'CODE', 'PRE', 'TITLE'
        ])
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
            const parent = node.parentElement
            if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
            if (parent.closest('[contenteditable="true"]')) return NodeFilter.FILTER_REJECT
            return NodeFilter.FILTER_ACCEPT
          }
        })
        const nodes = []
        let current
        while ((current = walker.nextNode())) nodes.push(current)

        const BATCH_SIZE = 50
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
          const batch = nodes.slice(i, i + BATCH_SIZE)
          const joined = batch.map((node) => node.nodeValue.replace(/\\s*\\n\\s*/g, ' ').trim()).join('\\n')
          const url =
            'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' +
            encodeURIComponent(${srcLang}) + '&tl=' + encodeURIComponent(${lang}) + '&q=' + encodeURIComponent(joined)
          try {
            const res = await fetch(url)
            const data = await res.json()
            const segments = (data && data[0]) || []
            const lines = []
            let acc = ''
            for (const seg of segments) {
              acc += seg[0]
              const isLastSeg = seg === segments[segments.length - 1]
              if (String(seg[1]).endsWith('\\n') || isLastSeg) {
                lines.push(acc)
                acc = ''
              }
            }
            for (let j = 0; j < batch.length && j < lines.length; j++) {
              const original = batch[j].nodeValue
              const leading = (original.match(/^\\s*/) || [''])[0]
              const trailing = (original.match(/\\s*$/) || [''])[0]
              batch[j].nodeValue = leading + lines[j].trim() + trailing
            }
          } catch (e) {
            // Ce lot échoue (réseau, CSP du site) — on continue avec les suivants,
            // silencieusement : jamais d'UI d'erreur visible dans la page.
          }
        }
      })()`,
      true
    )
  }

  /**
   * Revient à la version originale. Un essai précédent restaurait via
   * `document.body.innerHTML = <instantané>` sans recharger — mais un site
   * qui gère lui-même son DOM (SPA React/Vue/etc.) peut re-rendre par-dessus
   * ce remplacement brut (son état interne ne sait pas qu'on a substitué le
   * DOM sous ses pieds), ce qui donnait l'impression que « Afficher
   * l'original » ne faisait rien. Un vrai rechargement est plus lent mais
   * ne dépend d'aucune hypothèse sur le site — toujours fiable.
   */
  untranslate(id: PageId): void {
    const wc = this.liveContents(id)
    if (!wc) return
    // Le `reload()` ci-dessous redonne le focus à la page une fois chargée —
    // ce focus programmatique est indiscernable d'un clic utilisateur pour le
    // handler `wc.on('focus', ...)` et fermait à tort le popup de traduction
    // (voir le commentaire sur `suppressNextFocusHide`). On ignore donc le
    // tout prochain focus de CETTE page, avec un filet de sécurité au cas où
    // il ne revient jamais (page qui échoue à recharger).
    const existing = this.suppressNextFocusHide.get(id)
    if (existing) clearTimeout(existing)
    this.suppressNextFocusHide.set(
      id,
      setTimeout(() => this.suppressNextFocusHide.delete(id), 5000)
    )
    wc.reload()
  }

  /** Meilleure estimation de la langue de la page (attribut `<html lang>`), '' si absent/illisible. */
  async detectLanguage(id: PageId): Promise<string> {
    const wc = this.liveContents(id)
    if (!wc) return ''
    try {
      const lang = (await wc.executeJavaScript(
        `(document.documentElement.lang || '').split('-')[0].toLowerCase()`,
        true
      )) as string
      return lang || ''
    } catch {
      return ''
    }
  }

  // ─── Aperçus & contexte ────────────────────────────────────────────────────

  async capture(id: PageId, force = false): Promise<void> {
    const view = this.views.get(id)
    if (!view) return
    const version = await capturePreview(id, view, force)
    if (version !== null) this.delegate.onPreviewUpdated(id, version)
  }

  /** Extrait titre + texte de la page (données opaques, jamais évaluées). */
  async getPageContext(id: PageId): Promise<PageContext | null> {
    const wc = this.liveContents(id)
    const row = pagesRepo.get(id)
    if (!row) return null
    if (!wc) return { title: row.title, url: row.url, excerpt: '' }
    try {
      const raw = (await wc.executeJavaScript(
        `(() => {
          const d = document
          const meta = d.querySelector('meta[name="description"]')
          const desc = meta ? (meta.getAttribute('content') || '') : ''
          const text = ((d.body && d.body.innerText) || '').replace(/\\s+/g, ' ').slice(0, 7000)
          return JSON.stringify({ t: d.title || '', d: desc.slice(0, 400), x: text })
        })()`,
        true
      )) as string
      const parsed = JSON.parse(raw) as { t: string; d: string; x: string }
      const excerpt = [parsed.d, parsed.x].filter(Boolean).join('\n').slice(0, 7000)
      return { title: parsed.t || row.title, url: row.url, excerpt }
    } catch {
      return { title: row.title, url: row.url, excerpt: '' }
    }
  }

  private async extractText(id: PageId): Promise<void> {
    const ctx = await this.getPageContext(id)
    if (!ctx) return
    const text = `${ctx.title}\n${ctx.url}\n${ctx.excerpt}`.slice(0, 6000)
    this.delegate.onTextExtracted(id, text)
  }

  // ─── Fermeture ─────────────────────────────────────────────────────────────

  private destroyView(id: PageId, opts: { keepPreview: boolean }): void {
    const view = this.views.get(id)
    if (view) {
      if (this.attached.has(id)) {
        // `closeAll()` est appelée depuis l'évènement `closed` de la fenêtre
        // (main/index.ts) — à ce moment-là `this.win` est déjà détruite, et
        // `contentView.removeChildView()` dessus lève « Object has been
        // destroyed ». Rien à retirer d'une fenêtre qui n'existe déjà plus.
        if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view)
        this.attached.delete(id)
      }
      if (!view.webContents.isDestroyed()) view.webContents.close()
      this.views.delete(id)
    }
    this.bounds.delete(id)
    this.lru = this.lru.filter((x) => x !== id)
    this.storeShimHosts.delete(id)
    this.storeShimScriptIds.delete(id)
    const focusTimer = this.suppressNextFocusHide.get(id)
    if (focusTimer !== undefined) {
      clearTimeout(focusTimer)
      this.suppressNextFocusHide.delete(id)
    }
    if (!opts.keepPreview) deletePreview(id)
  }

  /** Ferme définitivement une page (vue + aperçu + runtime). */
  closePage(id: PageId): void {
    const row = pagesRepo.get(id)
    if (row) {
      this.closedStack.push({
        spaceId: row.space_id,
        url: row.url,
        parentId: row.parent_id,
        canvas: { x: row.canvas_x, y: row.canvas_y, w: row.canvas_w, h: row.canvas_h }
      })
      if (this.closedStack.length > MAX_CLOSED_HISTORY) this.closedStack.shift()
    }
    this.destroyView(id, { keepPreview: false })
    this.runtime.delete(id)
    this.visibleIds = this.visibleIds.filter((x) => x !== id)
  }

  /** Retire et retourne la dernière page fermée (façon Ctrl+Maj+T), ou null. */
  popLastClosed(): ClosedPageSnapshot | null {
    return this.closedStack.pop() ?? null
  }

  closeAll(): void {
    for (const id of [...this.views.keys()]) {
      this.destroyView(id, { keepPreview: true })
    }
  }
}
