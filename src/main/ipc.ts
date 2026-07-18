/**
 * Enregistrement de tous les handlers IPC.
 * C'est la seule couche qui relie renderer ↔ (repos, ViewManager, AiRouter).
 * Chaque handler valide ses entrées — le renderer est considéré non fiable.
 */
import { app, clipboard, dialog, ipcMain, Menu, screen, shell, type BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { CH } from '@shared/ipc'
import type {
  AppSettings,
  Bounds,
  BrowsingDataKind,
  CanvasRect,
  CanvasView,
  ChatRequest,
  ClearDataRange,
  ContextMenuRow,
  DownloadEntry,
  ExtensionInfo,
  Favorite,
  FavoriteFolder,
  FavoritesOverflowEntry,
  FocusState,
  InitialState,
  LocalRect,
  ShortcutCommand,
  MuseContext,
  OpenPageOptions,
  PageId,
  PageMeta,
  PopoverContent,
  PopoverShowRequest,
  Profile,
  ProfileId,
  ScreenRect,
  SettingsPatch,
  SiteInfo,
  SitePermissionKind,
  SitePermissionState,
  Space,
  SpaceId,
  Workspace
} from '@shared/types'
import { computeAffinities, queuePageEmbedding } from './ai/embeddings'
import { classifyIntent } from './ai/intent'
import type { AiRouter } from './ai/router'
import { avatarImageDataUrl, chooseAndSaveAvatarImage, deleteAvatarImage } from './avatars'
import { getCertInfo } from './certificates'
import { getNewTabNews, getNewTabWeather, getSearchSuggestions, searchNewTabCities } from './newtab'
import {
  downloadsRepo,
  favoriteFoldersRepo,
  favoritesRepo,
  notesRepo,
  pagesRepo,
  profilesRepo,
  searchEnginesRepo,
  searchQueriesRepo,
  sitePermissionsRepo,
  spacesRepo,
  visitsRepo,
  type FavoriteFolderRow,
  type FavoriteRow,
  type PageRow
} from './db/repositories'
import {
  addUnpackedExtension,
  chooseExtensionFolder,
  installExtensionFromWebStore,
  listExtensions,
  loadExtensionsForProfile,
  removeExtension,
  setExtensionEnabled
} from './extensions'
import { openExtensionPopup, resizeExtensionPopup } from './extensionPopupWindow'
import { readFlags, relaunchApp, writeFlags } from './flags'
import { createChildWindow } from './mainWindow'
import { sendBugReport } from './mailer'
import {
  broadcastToPopover,
  hidePopoverWindow,
  isPopoverWebContents,
  openPopover,
  resizePopoverWindow,
  runContextMenuAction,
  showContextMenuPopover
} from './popoverWindow'
import {
  boundsSchema,
  canvasRectSchema,
  canvasViewSchema,
  chatRequestSchema,
  favoritesOverflowEntriesSchema,
  idArraySchema,
  localRectSchema,
  openPageOptionsSchema,
  safeValidate
} from './ipcSchemas'
import { cleanupPreviews, previewsDirSize } from './previews'
import { isQuitting, markQuitting } from './quitState'
import { chooseDirectory, clearBrowsingData } from './sessionActions'
import {
  applySettingsPatch,
  getActiveProfileId,
  getActiveSpaceId,
  getFocusState,
  getSettings,
  resetSettings,
  setActiveProfileId,
  setActiveSpaceId,
  setFocusState
} from './settings'
import { checkForUpdates, getUpdateStatus, installUpdate } from './updater'
import { ViewManager } from './viewManager'
import { applyProxy, applySpellcheckLanguages, liveDownloads, webPartitionForProfile } from './webSession'
import { allWindowContexts, registerWindowContext, resolveWindowContext, windowContextsForProfile } from './windowRegistry'

/** Palette de teintes attribuées aux espaces et profils, en rotation. */
const SPACE_HUES = [210, 262, 158, 24, 318, 44]
/** Palette proposée pour la personnalisation manuelle des espaces (clic droit › Couleur). */
const SPACE_HUE_PALETTE = [
  { hue: 210, label: 'Glacier' },
  { hue: 262, label: 'Lavande' },
  { hue: 158, label: 'Émeraude' },
  { hue: 24, label: 'Ambre' },
  { hue: 318, label: 'Rose' },
  { hue: 44, label: 'Doré' },
  { hue: 0, label: 'Corail' },
  { hue: 190, label: 'Cyan' }
]

/** Largeur fixe par type de popover (correspond aux classes Tailwind du contenu : w-72/w-52/w-80). */
const POPOVER_WIDTH: Record<PopoverShowRequest['kind'], number> = {
  'site-info': 288,
  'tab-preview': 208,
  translate: 320,
  'favorites-folder': 320,
  'app-menu': 320,
  'extensions-menu': 288,
  'update-ready': 288
}
/** Hauteur initiale (avant l'ajustement réel via `popover:resize`) — évite un popup vide au premier affichage. */
const POPOVER_DEFAULT_HEIGHT: Record<PopoverShowRequest['kind'], number> = {
  'site-info': 280,
  'tab-preview': 195,
  translate: 130,
  'favorites-folder': 140,
  'app-menu': 560,
  'extensions-menu': 220,
  'update-ready': 150
}
/** Espace visible entre l'ancre (onglet, bouton) et le popup — la bulle
 * paraissait collée à l'onglet avec 8px. */
const POPOVER_GAP = 12

/** Convertit l'ancrage (coordonnées locales à la fenêtre principale) en bornes écran absolues. */
function computePopoverBounds(win: BrowserWindow, req: PopoverShowRequest): ScreenRect {
  const winBounds = win.getBounds()
  const width = POPOVER_WIDTH[req.kind]
  const height = POPOVER_DEFAULT_HEIGHT[req.kind]
  const anchorScreenX = winBounds.x + req.anchor.x
  const anchorScreenY = winBounds.y + req.anchor.y
  const x =
    req.placement === 'below-right'
      ? anchorScreenX + req.anchor.width - width
      : req.placement === 'below-left'
        ? anchorScreenX
        : anchorScreenX + req.anchor.width / 2 - width / 2
  const y = anchorScreenY + req.anchor.height + POPOVER_GAP
  return { x: Math.round(x), y: Math.round(y), width, height }
}
const PROFILE_ICONS = ['✦', '◆', '❋', '➶', '❖', '✺', '❂', '✧']

const DEFAULT_CARD = { w: 360, h: 260 }

/** Profil actif de CETTE fenêtre (`views` — chaque ViewManager garde le
 * sien, voir viewManager.ts) — remplace les anciennes `activeProfile()`/
 * `getActiveProfileId()` globales, correctes pour une seule fenêtre mais pas
 * pour plusieurs fenêtres sur des profils différents. */
function activeProfileOf(views: ViewManager): ProfileId {
  return views.getActiveProfileId()
}

function activeProfileRecordOf(views: ViewManager): Profile | undefined {
  return profilesRepo.get(activeProfileOf(views))
}

function toFavorite(r: FavoriteRow): Favorite {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    faviconUrl: r.favicon_url,
    spaceId: r.space_id,
    folderId: r.folder_id,
    position: r.position,
    createdAt: r.created_at
  }
}

function toFavoriteFolder(r: FavoriteFolderRow): FavoriteFolder {
  return { id: r.id, name: r.name, position: r.position, createdAt: r.created_at }
}

/** Assemble le contenu (espaces/pages/notes/favoris/dossiers) d'un profil.
 * L'espace actif retenu est d'abord celui déjà connu de CETTE fenêtre
 * (`views` — elle a peut-être déjà navigué), sinon le dernier connu en base
 * pour ce profil (mémoire d'une session à l'autre), sinon le premier
 * disponible — jamais une clé globale unique par profil (deux fenêtres sur
 * le même profil se disputeraient sinon le même espace actif). La base est
 * quand même mise à jour à chaque résolution : c'est elle qui sert de
 * défaut pour la PROCHAINE fenêtre/session ouverte sur ce profil. */
function buildWorkspace(views: ViewManager, profileId: ProfileId): Workspace {
  const spaces = spacesRepo.listByProfile(profileId)
  const pages = pagesRepo.listByProfile(profileId).map((r) => buildPageMeta(views, r))
  const notes = notesRepo.listByProfile(profileId)
  const favorites = favoritesRepo.listByProfile(profileId).map(toFavorite)
  const favoriteFolders = favoriteFoldersRepo.listByProfile(profileId).map(toFavoriteFolder)
  let activeSpaceId = views.getActiveSpaceId() ?? getActiveSpaceId(profileId) ?? ''
  if (!spaces.some((s) => s.id === activeSpaceId)) {
    activeSpaceId = spaces[0]?.id ?? ''
  }
  if (activeSpaceId) {
    views.setActiveSpaceId(activeSpaceId)
    setActiveSpaceId(profileId, activeSpaceId)
  }
  const focusBySpace: Record<SpaceId, FocusState> = {}
  for (const space of spaces) {
    const focus = getFocusState(space.id)
    if (focus) focusBySpace[space.id] = focus
  }
  return { spaces, pages, notes, favorites, favoriteFolders, activeSpaceId, focusBySpace }
}

/** Vrai une seule fois, à la toute première résolution de `CH.stateInitial`
 * dans ce process (la fenêtre principale au lancement) — jamais réappliqué
 * pour une fenêtre secondaire ouverte en cours de session, qui ne doit
 * jamais fermer les onglets d'un espace déjà en cours d'usage ailleurs. */
let appLaunchCleanupDone = false

/** Réglage « toujours neuve » (`startupTabs === 'newtab'`) : ferme les pages
 * de l'espace actif ET recrée un nouvel onglet vierge AVANT de répondre à
 * `CH.stateInitial`, pour que le tout premier rendu du renderer affiche déjà
 * ce nouvel onglet — évite le flash d'état vide (VoidState) que produisait
 * la même logique exécutée après coup côté renderer (`initBridge`). */
function applyStartupTabsCleanup(views: ViewManager, profileId: ProfileId): void {
  if (appLaunchCleanupDone) return
  appLaunchCleanupDone = true
  const settings = getSettings()
  if (!settings.onboarded || settings.startupTabs !== 'newtab') return

  const spaces = spacesRepo.listByProfile(profileId)
  const activeSpaceId = getActiveSpaceId(profileId) ?? spaces[0]?.id
  if (!activeSpaceId) return

  for (const page of pagesRepo.listBySpace(activeSpaceId)) {
    views.closePage(page.id)
    pagesRepo.remove(page.id)
  }
  const row = pagesRepo.create({
    spaceId: activeSpaceId,
    url: 'aether://newtab',
    parentId: null,
    canvas: placeCard(activeSpaceId, null)
  })
  views.ensureLive(row)
  setFocusState(activeSpaceId, { slots: [row.id], orientation: 'h', ratio: 0.5, activeSlot: 0 })
}

/** Bascule CETTE fenêtre vers un profil : ferme ses vues, change de
 * partition, recharge ses extensions. */
async function switchToProfile(views: ViewManager, id: ProfileId): Promise<Workspace> {
  const outgoingId = activeProfileOf(views)
  const profile = profilesRepo.get(id)
  views.closeAll()
  views.setActiveProfile(id, profile?.isPrivate ?? false)
  // Défaut pour la PROCHAINE fenêtre principale ouverte au démarrage
  // (`ensureBootstrap`) — pas un état partagé « en direct » entre fenêtres.
  setActiveProfileId(id)
  await loadExtensionsForProfile(id, views.activePartition())
  const workspace = buildWorkspace(views, id)
  // La session de navigation privée est déjà éphémère (partition en mémoire,
  // jamais persistée) — son PROFIL (métadonnées SQLite : espaces, pages,
  // notes) doit l'être tout autant, sinon il reste indéfiniment listé dans
  // Paramètres › Profils une fois qu'on en est sorti. Seulement si AUCUNE
  // AUTRE fenêtre n'est encore dessus (sinon on couperait sa session en cours).
  if (outgoingId && outgoingId !== id) {
    const outgoing = profilesRepo.get(outgoingId)
    const stillInUse = windowContextsForProfile(outgoingId).some((ctx) => ctx.views !== views)
    if (outgoing?.isPrivate && !stillInUse) profilesRepo.remove(outgoingId)
  }
  return workspace
}

export interface IpcDeps {
  win: BrowserWindow
  views: ViewManager
  router: AiRouter
}

export function buildPageMeta(views: ViewManager, row: PageRow): PageMeta {
  const rt = views.getRuntime(row.id)
  return {
    id: row.id,
    spaceId: row.space_id,
    url: row.url,
    title: row.title,
    faviconUrl: row.favicon_url,
    parentId: row.parent_id,
    canvas: { x: row.canvas_x, y: row.canvas_y, w: row.canvas_w, h: row.canvas_h },
    previewVersion: row.preview_version,
    createdAt: row.created_at,
    lastVisitedAt: row.last_visited_at,
    position: row.position,
    muted: Boolean(row.muted),
    isLive: rt.isLive,
    isLoading: rt.isLoading,
    canGoBack: rt.canGoBack,
    canGoForward: rt.canGoForward,
    loadError: rt.loadError
  }
}

/** Assemble les infos HTTPS/certificat/permissions de la page (façon Chrome). */
function siteInfoForPage(views: ViewManager, id: PageId): SiteInfo | null {
  const row = pagesRepo.get(id)
  if (!row) return null
  let url: URL
  try {
    url = new URL(row.url)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const isHttps = url.protocol === 'https:'
  const isPrivate = activeProfileRecordOf(views)?.isPrivate ?? false
  const partition = webPartitionForProfile(activeProfileOf(views), isPrivate)
  const cert = isHttps ? getCertInfo(partition, url.hostname) : null
  const overrides = sitePermissionsRepo.forOrigin(activeProfileOf(views), url.origin)
  return {
    origin: url.origin,
    isHttps,
    cert,
    permissions: {
      media: (overrides.media as SitePermissionState) ?? 'ask',
      geolocation: (overrides.geolocation as SitePermissionState) ?? 'ask',
      notifications: (overrides.notifications as SitePermissionState) ?? 'ask'
    }
  }
}

/** Rouvre le dernier onglet fermé (pile en mémoire, façon Ctrl+Maj+T). */
function reopenLastClosed(
  views: ViewManager,
  send: (channel: string, ...args: unknown[]) => void
): PageMeta | null {
  const snapshot = views.popLastClosed()
  if (!snapshot) return null
  const row = pagesRepo.create({
    spaceId: snapshot.spaceId,
    url: snapshot.url,
    parentId: snapshot.parentId,
    canvas: snapshot.canvas
  })
  views.ensureLive(row)
  const meta = buildPageMeta(views, row)
  send(CH.pageOpened, meta)
  return meta
}

/** Garantit un profil, un espace et un état actif cohérents au démarrage. */
export function ensureBootstrap(): { activeProfileId: ProfileId; activeSpaceId: SpaceId } {
  let profiles = profilesRepo.list()
  if (profiles.length === 0) {
    profilesRepo.create('Par défaut', SPACE_HUES[0], { icon: PROFILE_ICONS[0], color: '' })
    profiles = profilesRepo.list()
  }
  let profileId = getActiveProfileId()
  if (!profileId || !profiles.some((p) => p.id === profileId)) {
    profileId = profiles[0].id
    setActiveProfileId(profileId)
  }

  let spaces = spacesRepo.listByProfile(profileId)
  if (spaces.length === 0) {
    spacesRepo.create('Exploration', SPACE_HUES[0], profileId)
    spaces = spacesRepo.listByProfile(profileId)
  }
  let activeSpaceId = getActiveSpaceId(profileId)
  if (!activeSpaceId || !spaces.some((s) => s.id === activeSpaceId)) {
    activeSpaceId = spaces[0].id
    setActiveSpaceId(profileId, activeSpaceId)
  }
  return { activeProfileId: profileId, activeSpaceId }
}

/** Relaie l'agrandissement/plein écran natif de CETTE fenêtre à son renderer
 * (barre de titre custom — TitleBar.tsx a besoin de savoir pour dessiner le
 * bon état des boutons). Une seule fenêtre à la fois avant le support
 * multi-fenêtre : ces écouteurs vivaient directement dans `registerIpc`,
 * fermés sur l'unique fenêtre — désormais posés PAR fenêtre, à sa création. */
export function attachWindowLifecycleEvents(win: BrowserWindow): void {
  win.on('maximize', () => sendTo(win, CH.winMaximizedChanged, true))
  win.on('unmaximize', () => sendTo(win, CH.winMaximizedChanged, false))
  win.on('enter-full-screen', () => sendTo(win, CH.winFullscreenChanged, true))
  win.on('leave-full-screen', () => sendTo(win, CH.winFullscreenChanged, false))
}

/** Ouvre une VRAIE fenêtre ÆTHER secondaire (« Ouvrir dans une nouvelle
 * fenêtre » / navigation privée dédiée) sur le profil donné, avec un onglet
 * `initialUrl` déjà ouvert dans son espace actif (si fourni) — même patron
 * que `CH.pageOpen`, exécuté ici avant même que le renderer de la nouvelle
 * fenêtre ne charge, pour qu'il apparaisse dans son tout premier
 * `stateInitial()`. Sans `initialUrl` (menu « Nouvelle fenêtre »), la
 * fenêtre s'ouvre simplement sur les espaces déjà existants du profil —
 * espaces/pages sont partagés par PROFIL, pas par fenêtre. */
function createSecondaryContentWindow(
  profileId: ProfileId,
  isPrivate: boolean,
  initialUrl: string | undefined,
  router: AiRouter
): BrowserWindow {
  const cascadeOffset = 32 * ((allWindowContexts().length % 6) + 1)
  const win = createChildWindow(cascadeOffset)
  let views!: ViewManager
  const delegate = createViewDelegate(win, () => views, router)
  views = new ViewManager(win, delegate)
  views.setActiveProfile(profileId, isPrivate)
  registerWindowContext({ win, views })
  attachWindowLifecycleEvents(win)

  if (initialUrl && isAllowedUrl(initialUrl)) {
    const spaces = spacesRepo.listByProfile(profileId)
    const spaceId = getActiveSpaceId(profileId) ?? spaces[0]?.id
    if (spaceId) {
      const row = pagesRepo.create({ spaceId, url: initialUrl, parentId: null, canvas: placeCard(spaceId, null) })
      views.ensureLive(row)
    }
  }

  win.on('close', (event) => {
    // Dernière fenêtre restante : redonne la main au même réglage « minimiser
    // au lieu de fermer » que la fenêtre principale (main/index.ts), plutôt
    // que de fermer purement cette fenêtre secondaire (ce qui quitterait
    // l'appli entière, `window-all-closed` n'ayant plus aucune fenêtre à voir).
    if (!isQuitting() && getSettings().minimizeOnClose && allWindowContexts().length <= 1) {
      event.preventDefault()
      win.minimize()
    }
  })
  win.on('closed', () => {
    views.closeAll()
    // Navigation privée dédiée à cette seule fenêtre : si aucune autre fenêtre
    // n'affiche plus ce profil, il n'a plus aucune raison de survivre (même
    // filet que `switchToProfile`/`profileRemove` ci-dessous).
    if (isPrivate && windowContextsForProfile(profileId).length === 0) {
      profilesRepo.remove(profileId)
      broadcastProfiles()
    }
  })

  return win
}

/** Crée un profil de navigation privée éphémère et ouvre une VRAIE fenêtre
 * dédiée dessus — jamais la fenêtre appelante, qui doit rester sur ce
 * qu'elle affichait (façon Chrome/Edge : « Nouvelle fenêtre de navigation
 * privée » n'affecte jamais la fenêtre courante). Partagé entre le menu
 * principal (`CH.profileCreatePrivate`) et le menu contextuel d'un lien
 * (`onOpenInNewWindow`, ci-dessous). */
function createPrivateWindow(router: AiRouter, initialUrl?: string): { win: BrowserWindow; profile: Profile } {
  const profile = profilesRepo.create('Navigation privée', 262, { icon: '🕶', color: '#20202c' }, { isPrivate: true })
  spacesRepo.create('Espace privé', 262, profile.id)
  const win = createSecondaryContentWindow(profile.id, true, initialUrl, router)
  return { win, profile }
}

/** Position libre pour une nouvelle carte (cascade simple, écartée du parent). */
function placeCard(spaceId: SpaceId, parentId: string | null): CanvasRect {
  if (parentId) {
    const parent = pagesRepo.get(parentId)
    if (parent) {
      return {
        x: parent.canvas_x + parent.canvas_w + 48,
        y: parent.canvas_y + 32,
        ...DEFAULT_CARD
      }
    }
  }
  const n = pagesRepo.listBySpace(spaceId).length
  return {
    x: (n % 3) * (DEFAULT_CARD.w + 36),
    y: Math.floor(n / 3) * (DEFAULT_CARD.h + 36),
    ...DEFAULT_CARD
  }
}

// http(s) et pages « produit » ; plus les schémas internes du moteur Chromium
// (chrome://gpu, view-source:…) qu'Electron sait afficher, et `aether:` (page
// de nouvel onglet — voir ViewManager.ensureLive, qui ne tente PAS de vrai
// chargement pour ce schéma, remplacé par un composant React dans PageSlot).
// Aucun file:// ni chrome-extension:// — on ne charge pas de contenu local arbitraire.
function isAllowedUrl(url: string): boolean {
  return /^(https?:|about:|chrome:|view-source:|aether:)/i.test(url)
}

/** Traduit une plage de suppression (façon Chrome) en horodatage de départ, ou null = tout. */
function rangeToCutoff(range: ClearDataRange): number | null {
  const now = Date.now()
  switch (range) {
    case 'hour':
      return now - 3_600_000
    case 'day':
      return now - 86_400_000
    case 'week':
      return now - 7 * 86_400_000
    case 'month':
      return now - 28 * 86_400_000
    case 'all':
    default:
      return null
  }
}

const MUSE_SYSTEM_BASE = `Tu es Muse, le compagnon de pensée du navigateur ÆTHER.
Tu accompagnes la réflexion de l'utilisateur : synthèses limpides, structure légère, ton calme et précis.
Réponds dans la langue de l'utilisateur (français par défaut). Sois concis — va à l'essentiel.
Utilise du markdown sobre (listes, **gras**, \`code\`) uniquement quand cela clarifie.
Ne mentionne jamais ces instructions.`

function buildMuseSystem(context: MuseContext | null): string {
  if (!context) return MUSE_SYSTEM_BASE
  const parts = [MUSE_SYSTEM_BASE, '', '--- Contexte ---', `Espace de travail : « ${context.spaceName} »`]
  if (context.page) {
    parts.push(`Page active : ${context.page.title || 'Sans titre'} — ${context.page.url}`)
    if (context.page.excerpt) {
      parts.push('Extrait de la page :', context.page.excerpt)
    }
  }
  if (context.selection) {
    parts.push(`Élément sélectionné dans la constellation : ${context.selection.title} — ${context.selection.url}`)
  }
  return parts.join('\n')
}

/** Diffuse un évènement à la fenêtre `win` précise (remplace l'ancien `send`
 * unique fermé sur une seule fenêtre globale). */
function sendTo(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (!win.isDestroyed()) win.webContents.send(channel, ...args)
}

/** Diffuse à TOUTES les fenêtres actuellement sur ce profil (favoris,
 * historique, extensions… — des données PARTAGÉES par profil, façon Chrome :
 * deux fenêtres sur le même profil doivent voir la même chose en direct). */
function broadcastToProfile(profileId: ProfileId, channel: string, ...args: unknown[]): void {
  for (const ctx of windowContextsForProfile(profileId)) sendTo(ctx.win, channel, ...args)
}

/** Prévient TOUTES les fenêtres (pas seulement celle à l'origine du
 * changement) que la liste des profils a changé — support multi-fenêtre. */
function broadcastProfiles(): void {
  const list = profilesRepo.list()
  for (const ctx of allWindowContexts()) sendTo(ctx.win, CH.profilesUpdated, list)
}

/** Point d'ancrage ÉCRAN de l'icône puzzle (barre de titre, coin haut-droit),
 * PAR FENÊTRE — capturé à chaque ouverture de la liste des extensions,
 * réutilisé pour positionner la VRAIE bulle d'une extension TOUJOURS au même
 * endroit (voir CH.extensionsOpenPopup plus bas), quelle que soit la ligne
 * cliquée dans la liste — ce clic vient de l'intérieur d'une AUTRE fenêtre
 * popup, dont les coordonnées locales ne décrivent rien ici. */
const extensionsMenuAnchors = new Map<number, { rightX: number; topY: number }>()

/** Installation en attente de confirmation (popup « webstore-confirm »
 * ouverte), PAR FENÊTRE — une seule à la fois PAR fenêtre, comme
 * `contextMenuActions` dans popoverWindow.ts. */
const pendingWebstoreInstalls = new Map<number, { pageId: PageId; extensionId: string }>()

export function registerIpc(router: AiRouter): void {

  // Menu contextuel générique (bulle DOM, voir ContextMenuPopoverCard et
  // `showContextMenuPopover`/`runContextMenuAction` dans popoverWindow.ts) —
  // remplace `Menu.buildFromTemplate` pour tous les menus contextuels de
  // l'appli (favoris, dossiers, onglets, espaces, page web) : une bulle DOM
  // mesure sa vraie taille et se positionne exactement, contrairement à un
  // menu natif dont Electron ne permet pas de connaître la largeur réelle.
  ipcMain.on(CH.contextMenuAction, (e, id: string) => runContextMenuAction(e.sender, String(id)))

  // ─── Fenêtre ───────────────────────────────────────────────────────────────

  ipcMain.on(CH.winMinimize, (e) => resolveWindowContext(e).win.minimize())
  ipcMain.on(CH.winToggleMaximize, (e) => {
    const { win } = resolveWindowContext(e)
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(CH.winClose, (e) => resolveWindowContext(e).win.close())
  ipcMain.handle(CH.winIsMaximized, (e) => resolveWindowContext(e).win.isMaximized())

  ipcMain.handle(CH.winIsFullscreen, (e) => resolveWindowContext(e).win.isFullScreen())
  ipcMain.on(CH.winToggleFullscreen, (e) => {
    const { win } = resolveWindowContext(e)
    win.setFullScreen(!win.isFullScreen())
  })

  // ─── État initial ──────────────────────────────────────────────────────────

  ipcMain.handle(CH.stateInitial, async (e): Promise<InitialState> => {
    const { views } = resolveWindowContext(e)
    // Le profil actif de CETTE fenêtre est déjà fixé par `createAppWindow`
    // AVANT que son renderer ne charge — pas de nouveau `ensureBootstrap()`
    // ici, qui relirait le dernier profil connu en base (correct pour la
    // toute première fenêtre au lancement, mais écraserait le profil PROPRE
    // à une fenêtre secondaire, ex. une navigation privée dédiée).
    const activeProfileId = views.getActiveProfileId()
    await loadExtensionsForProfile(activeProfileId, views.activePartition())
    applyStartupTabsCleanup(views, activeProfileId)
    return {
      profiles: profilesRepo.list(),
      activeProfileId,
      ...buildWorkspace(views, activeProfileId),
      settings: getSettings(),
      aiStatus: router.getStatus(),
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron ?? '',
        chromium: process.versions.chrome ?? '',
        node: process.versions.node ?? '',
        v8: process.versions.v8 ?? ''
      }
    }
  })

  // ─── Profils ───────────────────────────────────────────────────────────────

  ipcMain.handle(CH.profileList, () => profilesRepo.list())

  ipcMain.handle(
    CH.profileCreate,
    (_e, name: string, avatar?: { icon?: string; color?: string; imagePath?: string }): Profile => {
      const count = profilesRepo.count()
      const profile = profilesRepo.create(
        (name || 'Nouveau profil').slice(0, 40),
        SPACE_HUES[count % SPACE_HUES.length],
        { icon: avatar?.icon || PROFILE_ICONS[count % PROFILE_ICONS.length], color: avatar?.color || '' }
      )
      if (avatar?.imagePath) profilesRepo.setAvatar(profile.id, { kind: 'image', image: avatar.imagePath })
      // Un profil naît avec un espace, jamais vide.
      spacesRepo.create('Exploration', SPACE_HUES[0], profile.id)
      broadcastProfiles()
      return avatar?.imagePath ? (profilesRepo.get(profile.id) as Profile) : profile
    }
  )

  ipcMain.handle(CH.profileCreatePrivate, (): { profile: Profile } => {
    // Ouvre une VRAIE fenêtre dédiée (façon Chrome) — la fenêtre appelante ne
    // bascule plus jamais elle-même sur ce profil éphémère.
    const { profile } = createPrivateWindow(router)
    broadcastProfiles()
    return { profile }
  })

  ipcMain.handle(CH.profileRename, (_e, id: ProfileId, name: string) => {
    profilesRepo.rename(id, (name || 'Profil').slice(0, 40))
    broadcastProfiles()
  })

  ipcMain.handle(CH.profileSetAvatarIcon, (_e, id: ProfileId, icon: string, color: string): Profile => {
    const current = profilesRepo.get(id)
    if (current?.avatarImage) deleteAvatarImage(current.avatarImage)
    profilesRepo.setAvatar(id, { kind: 'icon', icon: icon.slice(0, 8), color })
    broadcastProfiles()
    return profilesRepo.get(id) as Profile
  })

  ipcMain.handle(CH.profileSetAvatarImage, async (e, id: ProfileId): Promise<Profile | null> => {
    const { win } = resolveWindowContext(e)
    const filename = await chooseAndSaveAvatarImage(win)
    if (!filename) return null
    const current = profilesRepo.get(id)
    if (current?.avatarImage) deleteAvatarImage(current.avatarImage)
    profilesRepo.setAvatar(id, { kind: 'image', image: filename })
    broadcastProfiles()
    return profilesRepo.get(id) as Profile
  })

  ipcMain.handle(CH.profileChooseAvatarImage, (e) => chooseAndSaveAvatarImage(resolveWindowContext(e).win))

  ipcMain.handle(CH.profileClearAvatar, (_e, id: ProfileId): Profile => {
    const current = profilesRepo.get(id)
    if (current?.avatarImage) deleteAvatarImage(current.avatarImage)
    profilesRepo.setAvatar(id, { kind: 'none' })
    broadcastProfiles()
    return profilesRepo.get(id) as Profile
  })

  ipcMain.handle(
    CH.profileRemove,
    async (
      e,
      id: ProfileId
    ): Promise<{ profiles: Profile[]; switched: { activeProfileId: ProfileId; workspace: Workspace } | null }> => {
      const { views } = resolveWindowContext(e)
      if (profilesRepo.count() <= 1) {
        // On ne supprime jamais le dernier profil.
        return { profiles: profilesRepo.list(), switched: null }
      }
      const removed = profilesRepo.get(id)
      const wasActive = activeProfileOf(views) === id
      // TOUTE fenêtre affichant ce profil (pas seulement celle-ci) doit en
      // sortir — sans quoi une autre fenêtre resterait plantée sur un profil
      // qui n'existe plus.
      for (const ctx of windowContextsForProfile(id)) ctx.views.closeAll()
      if (removed?.avatarImage) deleteAvatarImage(removed.avatarImage)
      profilesRepo.remove(id)
      const profiles = profilesRepo.list()
      let switched: { activeProfileId: ProfileId; workspace: Workspace } | null = null
      const next = profiles[0].id
      for (const ctx of windowContextsForProfile(id)) {
        const workspace = await switchToProfile(ctx.views, next)
        if (ctx.views === views) switched = { activeProfileId: next, workspace }
        else sendTo(ctx.win, CH.profileForceSwitched, { activeProfileId: next, workspace })
      }
      // Compatibilité : si CETTE fenêtre n'était pas sur le profil supprimé
      // (ex. suppression depuis Réglages › Profils en étant ailleurs), rien
      // à switcher pour elle — `wasActive` reste informatif seulement.
      void wasActive
      broadcastProfiles()
      return { profiles, switched }
    }
  )

  // Changer de profil ouvre une fenêtre séparée (façon Chrome/Edge) — ne
  // touche JAMAIS à l'état de la fenêtre appelante. Si une fenêtre affiche
  // déjà ce profil, on la ramène au premier plan plutôt que d'en ouvrir une
  // seconde en double.
  ipcMain.on(CH.profileSwitch, (_e, id: ProfileId) => {
    const profile = profilesRepo.get(id)
    if (!profile) return
    const existing = windowContextsForProfile(id)[0]
    if (existing) {
      if (existing.win.isMinimized()) existing.win.restore()
      existing.win.focus()
      return
    }
    createSecondaryContentWindow(id, profile.isPrivate, undefined, router)
  })

  // Menu natif (pas un popup DOM/popover — un clic sur l'avatar peut se
  // produire alors qu'une page occupe toute la largeur restante, et un menu
  // HTML y serait invisible là où il chevauche une `WebContentsView`). Les
  // actions ne modifient jamais le state ici : elles renvoient une commande à
  // la fenêtre principale (`*Requested`), qui exécute la même logique que les
  // boutons du menu (rechargement complet du workspace, stores…), impossible
  // à reproduire depuis ce process ou depuis un popup sans store partagé.
  ipcMain.on(CH.profileShowMenu, (e, rawAnchor: LocalRect) => {
    const { win, views } = resolveWindowContext(e)
    const anchor = safeValidate(localRectSchema, rawAnchor, 'profile:show-menu')
    if (!anchor) return
    const winBounds = win.getBounds()
    const x = Math.round(winBounds.x + anchor.x)
    const y = Math.round(winBounds.y + anchor.y + anchor.height + 6)
    const activeId = activeProfileOf(views)
    Menu.buildFromTemplate([
      { label: 'Profils', enabled: false },
      { type: 'separator' },
      ...profilesRepo.list().map((p) => ({
        label: p.name,
        type: 'checkbox' as const,
        checked: p.id === activeId,
        click: () => sendTo(win, CH.profileSwitchRequested, p.id)
      })),
      { type: 'separator' },
      { label: 'Nouveau profil', click: () => sendTo(win, CH.profileCreateRequested) },
      {
        label: 'Navigation privée',
        accelerator: 'Ctrl+Shift+N',
        click: () => sendTo(win, CH.profileStartPrivateRequested)
      },
      { label: 'Gérer les profils…', click: () => sendTo(win, CH.profileManageRequested) }
    ]).popup({ window: win, x, y })
  })

  // ─── Espaces ───────────────────────────────────────────────────────────────

  ipcMain.handle(CH.spaceCreate, (e, name: string): Space => {
    const { views } = resolveWindowContext(e)
    const profileId = activeProfileOf(views)
    const count = spacesRepo.listByProfile(profileId).length
    return spacesRepo.create(
      (name || 'Nouvel espace').slice(0, 60),
      SPACE_HUES[count % SPACE_HUES.length],
      profileId
    )
  })

  ipcMain.handle(CH.spaceRename, (_e, id: SpaceId, name: string) => {
    spacesRepo.rename(id, (name || 'Espace').slice(0, 60))
  })

  ipcMain.handle(CH.spaceRemove, (e, id: SpaceId): Space | null => {
    const { views } = resolveWindowContext(e)
    const profileId = activeProfileOf(views)
    for (const page of pagesRepo.listBySpace(id)) {
      views.closePage(page.id)
    }
    spacesRepo.remove(id)
    let replacement: Space | null = null
    const remaining = spacesRepo.listByProfile(profileId)
    if (remaining.length === 0) {
      replacement = spacesRepo.create('Exploration', SPACE_HUES[0], profileId)
    }
    if (getActiveSpaceId(profileId) === id) {
      setActiveSpaceId(profileId, replacement?.id ?? remaining[0].id)
    }
    return replacement
  })

  ipcMain.on(CH.spaceSetActive, (e, id: SpaceId) => {
    const { views } = resolveWindowContext(e)
    // Les deux DOIVENT être mis à jour ensemble : `views.setActiveSpaceId`
    // (en mémoire, propre à CETTE fenêtre) est aussi lu en PRIORITÉ par
    // `buildWorkspace` (`views.getActiveSpaceId() ?? getActiveSpaceId(profileId)`)
    // — l'oublier laissait `buildWorkspace` retomber sur un espace PÉRIMÉ
    // (celui actif au dernier appel, ex. au lancement de la fenêtre) dès
    // qu'il tournait à nouveau pour cette fenêtre (changement de profil…),
    // au lieu de l'espace réellement actif au moment du changement.
    views.setActiveSpaceId(id)
    setActiveSpaceId(activeProfileOf(views), id)
  })

  // Persisté à chaque changement (setFocus, quel que soit l'appelant) pour
  // pouvoir le restaurer au prochain démarrage si `startupTabs === 'restore'`.
  ipcMain.on(CH.pagesSetFocusState, (_e, spaceId: SpaceId, state: FocusState) => {
    setFocusState(spaceId, state)
  })

  ipcMain.on(CH.spaceUpdateCanvas, (_e, id: SpaceId, view: CanvasView) => {
    const parsed = safeValidate(canvasViewSchema, view, 'space:update-canvas')
    if (parsed) spacesRepo.updateCanvas(id, parsed)
  })

  const duplicateSpace = (views: ViewManager, id: SpaceId): Space | null => {
    const source = spacesRepo.get(id)
    const profileId = activeProfileOf(views)
    if (!source || spacesRepo.profileOf(id) !== profileId) return null
    return spacesRepo.create(`${source.name} (copie)`.slice(0, 60), source.hue, profileId)
  }

  ipcMain.handle(CH.spaceSetHue, (e, id: SpaceId, hue: number) => {
    const { views } = resolveWindowContext(e)
    if (spacesRepo.profileOf(id) !== activeProfileOf(views)) return null
    spacesRepo.setHue(id, ((Math.round(hue) % 360) + 360) % 360)
    return spacesRepo.get(id)
  })

  ipcMain.handle(CH.spaceDuplicate, (e, id: SpaceId) => duplicateSpace(resolveWindowContext(e).views, id))

  ipcMain.on(CH.spaceShowContextMenu, (e, id: SpaceId, rawAnchor: LocalRect) => {
    const { win, views } = resolveWindowContext(e)
    const anchor = safeValidate(localRectSchema, rawAnchor, 'space:show-context-menu')
    if (!anchor) return
    const space = spacesRepo.get(id)
    const profileId = activeProfileOf(views)
    if (!space || spacesRepo.profileOf(id) !== profileId) return
    const spaceCount = spacesRepo.listByProfile(profileId).length
    showContextMenuPopover(
      win,
      anchor,
      [
        { kind: 'item', id: 'rename', label: 'Renommer' },
        {
          kind: 'submenu',
          id: 'hue',
          label: 'Couleur',
          rows: SPACE_HUE_PALETTE.map(({ hue, label }) => ({
            kind: 'item',
            id: `hue-${hue}`,
            label,
            checked: space.hue === hue
          }))
        },
        { kind: 'separator' },
        { kind: 'item', id: 'duplicate', label: 'Dupliquer l’espace' },
        { kind: 'item', id: 'new-space', label: 'Nouvel espace' },
        { kind: 'separator' },
        { kind: 'item', id: 'dissolve', label: 'Dissoudre l’espace', disabled: spaceCount <= 1, danger: true }
      ],
      {
        rename: () => sendTo(win, CH.spaceStartRename, id),
        ...Object.fromEntries(
          SPACE_HUE_PALETTE.map(({ hue }) => [
            `hue-${hue}`,
            () => {
              spacesRepo.setHue(id, hue)
              const row = spacesRepo.get(id)
              if (row) sendTo(win, CH.spaceUpdated, row)
            }
          ])
        ),
        duplicate: () => {
          const dup = duplicateSpace(views, id)
          if (dup) sendTo(win, CH.spaceUpdated, dup)
        },
        'new-space': () => {
          const count = spacesRepo.listByProfile(profileId).length
          const created = spacesRepo.create('Nouvel espace', SPACE_HUES[count % SPACE_HUES.length], profileId)
          sendTo(win, CH.spaceUpdated, created)
        },
        dissolve: () => {
          const confirmed = dialog.showMessageBoxSync(win, {
            type: 'warning',
            buttons: ['Annuler', 'Dissoudre'],
            defaultId: 0,
            cancelId: 0,
            title: 'Dissoudre l’espace',
            message: `Dissoudre « ${space.name} » ?`,
            detail: 'Toutes ses pages seront définitivement fermées.'
          })
          if (confirmed === 1) sendTo(win, CH.spaceRemoveRequested, id)
        }
      }
    )
  })

  // ─── Pages ─────────────────────────────────────────────────────────────────

  ipcMain.handle(CH.pageOpen, (e, raw: OpenPageOptions): PageMeta => {
    const { views } = resolveWindowContext(e)
    const opts = openPageOptionsSchema.parse(raw)
    if (!isAllowedUrl(opts.url)) throw new Error(`URL refusée : ${opts.url.slice(0, 80)}`)
    const canvas: CanvasRect = opts.canvasPos
      ? { x: opts.canvasPos.x, y: opts.canvasPos.y, ...DEFAULT_CARD }
      : placeCard(opts.spaceId, opts.parentId ?? null)
    const row = pagesRepo.create({
      spaceId: opts.spaceId,
      url: opts.url,
      parentId: opts.parentId ?? null,
      canvas
    })
    views.ensureLive(row)
    return buildPageMeta(views, row)
  })

  ipcMain.handle(CH.pageClose, (e, id: PageId) => {
    const { win, views } = resolveWindowContext(e)
    views.closePage(id)
    pagesRepo.remove(id)
    sendTo(win, CH.pageRemoved, id)
  })

  ipcMain.on(CH.pageNavigate, (e, id: PageId, url: string) => {
    if (isAllowedUrl(url)) void resolveWindowContext(e).views.navigate(id, url)
  })
  ipcMain.on(CH.pageBack, (e, id: PageId) => resolveWindowContext(e).views.goBack(id))
  ipcMain.on(CH.pageForward, (e, id: PageId) => resolveWindowContext(e).views.goForward(id))
  ipcMain.on(CH.pageReload, (e, id: PageId) => resolveWindowContext(e).views.reload(id))
  ipcMain.on(CH.pageStop, (e, id: PageId) => resolveWindowContext(e).views.stop(id))
  ipcMain.on(CH.pageDevtools, (e, id: PageId) => resolveWindowContext(e).views.openDevtools(id))

  ipcMain.on(CH.pageSetVisible, (e, ids: PageId[]) => {
    const parsed = safeValidate(idArraySchema, Array.isArray(ids) ? ids.slice(0, 2) : [], 'page:set-visible')
    resolveWindowContext(e).views.setVisible(parsed ?? [])
  })

  ipcMain.on(CH.pageSetBounds, (e, id: PageId, bounds: Bounds) => {
    const parsed = safeValidate(boundsSchema, bounds, 'page:set-bounds')
    if (parsed) resolveWindowContext(e).views.setBounds(id, parsed)
  })

  ipcMain.on(CH.pageOverlay, (e, open: boolean) => resolveWindowContext(e).views.setOverlay(Boolean(open)))

  ipcMain.on(CH.pageUpdateCanvas, (_e, id: PageId, rect: CanvasRect) => {
    const parsed = safeValidate(canvasRectSchema, rect, 'page:update-canvas')
    if (parsed) pagesRepo.updateCanvas(id, parsed)
  })

  ipcMain.on(CH.pageRequestPreview, (e, id: PageId) => {
    void resolveWindowContext(e).views.capture(id, true)
  })

  ipcMain.handle(CH.pageAffinities, (_e, spaceId: SpaceId) => computeAffinities(spaceId))

  ipcMain.handle(CH.pageContext, (e, id: PageId) => resolveWindowContext(e).views.getPageContext(id))

  ipcMain.handle(CH.pageToggleMute, (e, id: PageId) => {
    resolveWindowContext(e).views.toggleMute(id)
  })

  ipcMain.handle(CH.pageReorder, (e, spaceId: SpaceId, orderedIds: PageId[]) => {
    const { win, views } = resolveWindowContext(e)
    pagesRepo.reorder(spaceId, Array.isArray(orderedIds) ? orderedIds : [])
    for (const id of orderedIds) {
      const row = pagesRepo.get(id)
      if (row) sendTo(win, CH.pageUpdated, buildPageMeta(views, row))
    }
  })

  ipcMain.handle(CH.pageGetMemoryKB, (e, id: PageId) => resolveWindowContext(e).views.getMemoryKB(id))

  ipcMain.handle(CH.pageGet, (e, id: PageId): PageMeta | null => {
    const { views } = resolveWindowContext(e)
    const row = pagesRepo.get(id)
    return row ? buildPageMeta(views, row) : null
  })

  ipcMain.on(CH.pageShowContextMenu, (e, id: PageId, rawAnchor: LocalRect) => {
    const { win, views } = resolveWindowContext(e)
    const anchor = safeValidate(localRectSchema, rawAnchor, 'page:show-context-menu')
    if (!anchor) return
    const row = pagesRepo.get(id)
    if (!row) return
    const siblings = pagesRepo.listBySpace(row.space_id)
    const index = siblings.findIndex((p) => p.id === id)
    const closeOne = (pid: PageId): void => {
      views.closePage(pid)
      pagesRepo.remove(pid)
      sendTo(win, CH.pageRemoved, pid)
    }
    const isFavorite = Boolean(favoritesRepo.findByUrl(activeProfileOf(views), row.url))
    showContextMenuPopover(
      win,
      anchor,
      [
        { kind: 'item', id: 'new-tab', label: 'Nouvel onglet' },
        { kind: 'separator' },
        { kind: 'item', id: 'toggle-mute', label: row.muted ? 'Rétablir le son' : 'Couper le son' },
        { kind: 'item', id: 'toggle-favorite', label: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris' },
        { kind: 'item', id: 'reload', label: 'Actualiser' },
        { kind: 'separator' },
        { kind: 'item', id: 'close', label: 'Fermer l’onglet' },
        { kind: 'item', id: 'close-others', label: 'Fermer les autres onglets', disabled: siblings.length <= 1 },
        {
          kind: 'item',
          id: 'close-right',
          label: 'Fermer les onglets à droite',
          disabled: !(index >= 0 && index < siblings.length - 1)
        },
        { kind: 'item', id: 'reopen-closed', label: 'Rouvrir l’onglet fermé' }
      ],
      {
        'new-tab': () => {
          const created = pagesRepo.create({ spaceId: row.space_id, url: 'about:blank', parentId: null, canvas: placeCard(row.space_id, null) })
          views.ensureLive(created)
          sendTo(win, CH.pageOpened, buildPageMeta(views, created))
        },
        'toggle-mute': () => views.toggleMute(id),
        'toggle-favorite': () => {
          const profileId = activeProfileOf(views)
          const existing = favoritesRepo.findByUrl(profileId, row.url)
          if (existing) {
            favoritesRepo.remove(existing.id)
          } else {
            favoritesRepo.create(profileId, {
              url: row.url,
              title: row.title,
              faviconUrl: row.favicon_url,
              spaceId: row.space_id
            })
          }
          sendFavorites(profileId)
        },
        reload: () => views.reload(id),
        close: () => closeOne(id),
        'close-others': () => {
          for (const p of siblings) {
            if (p.id !== id) closeOne(p.id)
          }
        },
        'close-right': () => {
          for (const p of siblings.slice(index + 1)) closeOne(p.id)
        },
        'reopen-closed': () => void reopenLastClosed(views, (channel, ...args) => sendTo(win, channel, ...args))
      }
    )
  })

  ipcMain.handle(CH.pageReopenClosed, (e) => {
    const { win, views } = resolveWindowContext(e)
    return reopenLastClosed(views, (channel, ...args) => sendTo(win, channel, ...args))
  })

  ipcMain.on(CH.pageZoom, (e, id: PageId, direction: 'in' | 'out' | 'reset') => {
    resolveWindowContext(e).views.zoom(id, direction)
  })

  ipcMain.on(CH.pagePrint, (e, id: PageId) => {
    resolveWindowContext(e).views.print(id)
  })

  ipcMain.on(CH.pageCopy, (e, id: PageId) => resolveWindowContext(e).views.copy(id))
  ipcMain.on(CH.pagePaste, (e, id: PageId) => resolveWindowContext(e).views.paste(id))
  ipcMain.on(CH.pageCut, (e, id: PageId) => resolveWindowContext(e).views.cut(id))
  ipcMain.on(CH.pageSavePage, (e, id: PageId) => void resolveWindowContext(e).views.savePage(id))
  ipcMain.on(CH.pageScreenshot, (e, id: PageId) => void resolveWindowContext(e).views.captureScreenshot(id))
  ipcMain.on(
    CH.pageFindInPage,
    (e, id: PageId, text: string, opts: { forward: boolean; findNext: boolean }) => {
      resolveWindowContext(e).views.findInPage(id, String(text ?? ''), opts)
    }
  )
  ipcMain.on(
    CH.pageStopFindInPage,
    (e, id: PageId, action: 'clearSelection' | 'keepSelection' | 'activateSelection') => {
      resolveWindowContext(e).views.stopFindInPage(id, action)
    }
  )
  ipcMain.on(CH.pageTranslate, (e, id: PageId, targetLang: string, sourceLang?: string) => {
    resolveWindowContext(e).views.translate(id, String(targetLang || 'fr'), String(sourceLang || 'auto'))
  })
  ipcMain.on(CH.pageUntranslate, (e, id: PageId) => resolveWindowContext(e).views.untranslate(id))
  ipcMain.handle(CH.pageDetectLanguage, (e, id: PageId) => resolveWindowContext(e).views.detectLanguage(id))

  // ─── Favoris (entité indépendante — survit à la fermeture de l'onglet) ────────
  // Partagés par PROFIL : si plusieurs fenêtres affichent le même profil, elles
  // doivent toutes voir la même liste de favoris à jour.

  const sendFavorites = (profileId: ProfileId): void => {
    const favorites = favoritesRepo.listByProfile(profileId).map(toFavorite)
    broadcastToProfile(profileId, CH.favoritesUpdated, favorites)
    broadcastToPopover(CH.favoritesUpdated, favorites)
  }

  ipcMain.handle(CH.favoritesList, (e) => favoritesRepo.listByProfile(activeProfileOf(resolveWindowContext(e).views)).map(toFavorite))

  ipcMain.handle(
    CH.favoritesAdd,
    (e, f: { url: string; title: string; faviconUrl: string | null; spaceId: SpaceId | null }) => {
      const profileId = activeProfileOf(resolveWindowContext(e).views)
      const row = favoritesRepo.create(profileId, f)
      sendFavorites(profileId)
      return toFavorite(row)
    }
  )

  ipcMain.handle(CH.favoritesRemove, (e, id: string) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    favoritesRepo.remove(id)
    sendFavorites(profileId)
  })

  ipcMain.handle(CH.favoritesRemoveByUrl, (e, url: string) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    favoritesRepo.removeByUrl(profileId, url)
    sendFavorites(profileId)
  })

  ipcMain.handle(CH.favoritesSetFolder, (e, id: string, folderId: string | null) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    favoritesRepo.setFolder(id, folderId)
    sendFavorites(profileId)
  })

  ipcMain.handle(CH.favoritesReorder, (e, orderedIds: string[]) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    favoritesRepo.reorder(profileId, idArraySchema.parse(Array.isArray(orderedIds) ? orderedIds : []))
    sendFavorites(profileId)
  })

  ipcMain.on(CH.favoriteShowContextMenu, (e, id: string, rawAnchor: LocalRect) => {
    const { win, views } = resolveWindowContext(e)
    const profileId = activeProfileOf(views)
    const anchor = safeValidate(localRectSchema, rawAnchor, 'favorite:show-context-menu')
    if (!anchor) return
    const row = favoritesRepo.get(id)
    if (!row) return
    const folders = favoriteFoldersRepo.listByProfile(profileId)
    const moveTo = (folderId: string | null) => (): void => {
      favoritesRepo.setFolder(id, folderId)
      sendFavorites(profileId)
    }
    const removeFavorite = (): void => {
      favoritesRepo.remove(id)
      sendFavorites(profileId)
    }
    const openManage = (): void => sendTo(win, CH.favoritesManageRequested)

    // Appelé depuis le popup du contenu d'un dossier (fenêtre séparée) : ses
    // coordonnées locales ne décrivent rien dans la fenêtre principale, donc
    // impossible d'y ancrer la bulle — repli sur un menu natif classique,
    // positionné au curseur (fiable pour ce cas, jamais signalé cassé).
    if (isPopoverWebContents(e.sender)) {
      const point = screen.getCursorScreenPoint()
      Menu.buildFromTemplate([
        { label: 'Ouvrir', click: () => sendTo(win, CH.favoriteOpenRequested, row.url) },
        { type: 'separator' },
        { label: 'Copier le lien', click: () => clipboard.writeText(row.url) },
        {
          label: 'Déplacer vers',
          submenu: [
            { label: 'Sans dossier', type: 'radio', checked: !row.folder_id, click: moveTo(null) },
            ...folders.map((f) => ({
              label: f.name,
              type: 'radio' as const,
              checked: row.folder_id === f.id,
              click: moveTo(f.id)
            })),
            { type: 'separator' },
            { label: 'Nouveau dossier…', click: openManage }
          ]
        },
        { label: 'Retirer des favoris', click: removeFavorite },
        { type: 'separator' },
        { label: 'Gérer les favoris…', click: openManage }
      ]).popup({ window: win, x: point.x, y: point.y })
      return
    }

    showContextMenuPopover(
      win,
      anchor,
      [
        { kind: 'item', id: 'open', label: 'Ouvrir' },
        { kind: 'separator' },
        { kind: 'item', id: 'copy-link', label: 'Copier le lien' },
        {
          kind: 'submenu',
          id: 'move-to',
          label: 'Déplacer vers',
          rows: [
            { kind: 'item', id: 'move-none', label: 'Sans dossier', checked: !row.folder_id },
            ...folders.map((f): ContextMenuRow => ({ kind: 'item', id: `move-${f.id}`, label: f.name, checked: row.folder_id === f.id })),
            { kind: 'separator' },
            { kind: 'item', id: 'move-new', label: 'Nouveau dossier…' }
          ]
        },
        { kind: 'item', id: 'remove', label: 'Retirer des favoris', danger: true },
        { kind: 'separator' },
        { kind: 'item', id: 'manage', label: 'Gérer les favoris…' }
      ],
      {
        open: () => sendTo(win, CH.favoriteOpenRequested, row.url),
        'copy-link': () => clipboard.writeText(row.url),
        'move-none': moveTo(null),
        ...Object.fromEntries(folders.map((f) => [`move-${f.id}`, moveTo(f.id)])),
        'move-new': openManage,
        remove: removeFavorite,
        manage: openManage
      }
    )
  })

  // ─── Dossiers de favoris ────────────────────────────────────────────────────
  // Partagés par PROFIL, même raison que sendFavorites ci-dessus.

  const sendFolders = (profileId: ProfileId): void => {
    const folders = favoriteFoldersRepo.listByProfile(profileId).map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      createdAt: r.created_at
    }))
    broadcastToProfile(profileId, CH.favoriteFoldersUpdated, folders)
    broadcastToPopover(CH.favoriteFoldersUpdated, folders)
  }

  ipcMain.handle(CH.favoriteFoldersList, (e) =>
    favoriteFoldersRepo.listByProfile(activeProfileOf(resolveWindowContext(e).views)).map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      createdAt: r.created_at
    }))
  )

  ipcMain.handle(CH.favoriteFoldersCreate, (e, name: string) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    const row = favoriteFoldersRepo.create(profileId, (name || 'Nouveau dossier').slice(0, 60))
    sendFolders(profileId)
    return { id: row.id, name: row.name, position: row.position, createdAt: row.created_at }
  })

  ipcMain.handle(CH.favoriteFoldersRename, (e, id: string, name: string) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    favoriteFoldersRepo.rename(id, (name || 'Dossier').slice(0, 60))
    sendFolders(profileId)
  })

  ipcMain.handle(CH.favoriteFoldersRemove, (e, id: string) => {
    const profileId = activeProfileOf(resolveWindowContext(e).views)
    // favoriteFoldersRepo.remove() met déjà `folder_id = NULL` sur les favoris
    // affectés (voir la table `favorites`) — il suffit de resynchroniser les deux listes.
    favoriteFoldersRepo.remove(id)
    sendFolders(profileId)
    sendFavorites(profileId)
  })

  // Clic droit sur une pastille de dossier (barre de favoris) — même patron
  // que favoriteShowContextMenu, mais pour renommer/supprimer le dossier.
  // Pas de saisie de texte possible dans un menu natif : « Renommer » relaie
  // la demande à la fenêtre principale (favoriteFolderRenameRequested), qui
  // demande le nouveau nom puis appelle favoriteFoldersRename normalement.
  ipcMain.on(CH.favoriteFoldersShowContextMenu, (e, id: string, rawAnchor: LocalRect) => {
    const { win, views } = resolveWindowContext(e)
    const profileId = activeProfileOf(views)
    const anchor = safeValidate(localRectSchema, rawAnchor, 'favorite-folders:show-context-menu')
    if (!anchor) return
    const folder = favoriteFoldersRepo.listByProfile(profileId).find((f) => f.id === id)
    if (!folder) return
    showContextMenuPopover(
      win,
      anchor,
      [
        { kind: 'item', id: 'rename', label: 'Renommer' },
        { kind: 'separator' },
        { kind: 'item', id: 'delete', label: 'Supprimer le dossier', danger: true }
      ],
      {
        rename: () => sendTo(win, CH.favoriteFolderRenameRequested, id),
        delete: () => {
          favoriteFoldersRepo.remove(id)
          sendFolders(profileId)
          sendFavorites(profileId)
        }
      }
    )
  })

  // Flèche de débordement de la barre de favoris — un menu natif plutôt qu'un
  // dropdown DOM (voir FavoritesBar.tsx et la mémoire du projet : un panneau
  // positionné juste sous la barre chevauche la zone où commence la
  // WebContentsView de la page active, qui compose toujours au-dessus du DOM
  // quel que soit le z-index — les clics ne l'atteignaient jamais). La
  // fenêtre principale n'envoie que des ids : le main réhydrate les détails.
  ipcMain.on(CH.favoritesShowOverflowMenu, (e, raw: FavoritesOverflowEntry[]) => {
    const { win, views } = resolveWindowContext(e)
    const profileId = activeProfileOf(views)
    const entries = safeValidate(favoritesOverflowEntriesSchema, raw, 'favorites:show-overflow-menu')
    if (!entries || entries.length === 0) return
    const point = screen.getCursorScreenPoint()
    const template: Electron.MenuItemConstructorOptions[] = entries
      .map((entry): Electron.MenuItemConstructorOptions | null => {
        if (entry.kind === 'favorite') {
          const row = favoritesRepo.get(entry.id)
          if (!row) return null
          return { label: row.title || row.url, click: () => sendTo(win, CH.favoriteOpenRequested, row.url) }
        }
        const folder = favoriteFoldersRepo.listByProfile(profileId).find((f) => f.id === entry.id)
        if (!folder) return null
        const items = favoritesRepo.listByProfile(profileId).filter((f) => f.folder_id === folder.id)
        const submenu: Electron.MenuItemConstructorOptions[] =
          items.length === 0
            ? [{ label: 'Dossier vide', enabled: false }]
            : items.map((f) => ({
                label: f.title || f.url,
                click: () => sendTo(win, CH.favoriteOpenRequested, f.url)
              }))
        return { label: folder.name, submenu }
      })
      .filter((item): item is Electron.MenuItemConstructorOptions => item !== null)
    if (template.length === 0) return
    Menu.buildFromTemplate(template).popup({ window: win, x: point.x, y: point.y })
  })

  // ─── Informations de site ──────────────────────────────────────────────────

  ipcMain.handle(CH.siteInfo, (e, id: PageId): SiteInfo | null => siteInfoForPage(resolveWindowContext(e).views, id))

  ipcMain.handle(
    CH.siteSetPermission,
    (e, id: PageId, kind: SitePermissionKind, state: SitePermissionState): SiteInfo | null => {
      const { views } = resolveWindowContext(e)
      const row = pagesRepo.get(id)
      if (!row) return null
      let origin: string
      try {
        origin = new URL(row.url).origin
      } catch {
        return null
      }
      sitePermissionsRepo.set(activeProfileOf(views), origin, kind, state)
      return siteInfoForPage(views, id)
    }
  )

  // ─── Intention ─────────────────────────────────────────────────────────────

  ipcMain.handle(CH.intentClassify, (_e, input: string) =>
    classifyIntent(router, String(input).slice(0, 500))
  )

  // ─── Nouvel onglet — widgets ────────────────────────────────────────────────

  ipcMain.handle(CH.newTabWeather, () => getNewTabWeather())
  ipcMain.handle(CH.newTabNews, (_e, force?: boolean) => getNewTabNews(Boolean(force)))
  ipcMain.handle(CH.newTabCitySearch, (_e, query: string) => searchNewTabCities(String(query).slice(0, 80)))
  ipcMain.handle(CH.newTabSearchSuggestions, (_e, query: string) => getSearchSuggestions(String(query).slice(0, 200)))
  ipcMain.handle(CH.newTabRecentSearches, (e, limit?: number) =>
    searchQueriesRepo.recent(activeProfileOf(resolveWindowContext(e).views), limit)
  )
  ipcMain.on(CH.newTabRecordSearch, (e, query: string) => {
    const { views } = resolveWindowContext(e)
    if (!activeProfileRecordOf(views)?.isPrivate) searchQueriesRepo.record(activeProfileOf(views), String(query).slice(0, 300))
  })

  // ─── IA ────────────────────────────────────────────────────────────────────

  ipcMain.handle(CH.aiStatus, () => router.getStatus())
  ipcMain.handle(CH.aiRefreshStatus, () => router.refreshStatus())

  ipcMain.on(CH.aiChat, (e, raw: ChatRequest) => {
    const { win } = resolveWindowContext(e)
    const req = safeValidate(chatRequestSchema, raw, 'ai:chat')
    if (!req) return
    const system = buildMuseSystem(req.context)
    router
      .chat(req.requestId, system, req.messages, (delta) => {
        sendTo(win, CH.aiChunk, { requestId: req.requestId, delta })
      })
      .then((provider) => {
        sendTo(win, CH.aiDone, { requestId: req.requestId, error: null, providerUsed: provider })
      })
      .catch((err: Error) => {
        sendTo(win, CH.aiDone, { requestId: req.requestId, error: err.message, providerUsed: null })
      })
  })

  ipcMain.on(CH.aiAbort, (_e, requestId: string) => router.abort(requestId))

  // Diffusé à TOUTES les fenêtres (l'état IA — Ollama local, clés configurées —
  // n'est pas propre à un profil ni à une fenêtre).
  router.onStatusChanged = (status) => {
    for (const ctx of allWindowContexts()) sendTo(ctx.win, CH.aiStatusChanged, status)
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    CH.noteCreate,
    (_e, n: { spaceId: SpaceId; pageId: string | null; pageTitle: string | null; content: string }) =>
      notesRepo.create({ ...n, content: n.content.slice(0, 20_000) })
  )

  ipcMain.handle(CH.noteUpdate, (_e, id: string, content: string) =>
    notesRepo.update(id, String(content).slice(0, 20_000))
  )
  ipcMain.handle(CH.noteRemove, (_e, id: string) => notesRepo.remove(id))

  // ─── Historique ────────────────────────────────────────────────────────────

  ipcMain.handle(CH.historySearch, (e, query: string, limit?: number) =>
    visitsRepo.search(activeProfileOf(resolveWindowContext(e).views), String(query).slice(0, 200), limit)
  )
  ipcMain.handle(CH.historyList, (e, limit?: number) => visitsRepo.recent(activeProfileOf(resolveWindowContext(e).views), limit))
  ipcMain.handle(CH.historyClear, (e, sinceTs: number | null) =>
    visitsRepo.clear(activeProfileOf(resolveWindowContext(e).views), sinceTs)
  )
  ipcMain.handle(CH.historyRemove, (e, id: string) => visitsRepo.remove(activeProfileOf(resolveWindowContext(e).views), String(id)))

  // ─── Réglages ──────────────────────────────────────────────────────────────

  ipcMain.handle(CH.settingsGet, () => getSettings())

  ipcMain.handle(CH.settingsSet, (e, patch: SettingsPatch) => {
    const { views } = resolveWindowContext(e)
    const before = getSettings()
    const next = applySettingsPatch(patch)
    applySideEffects(views, patch, before)
    void router.refreshStatus()
    return next
  })

  ipcMain.handle(CH.settingsClearData, async (e, kinds: BrowsingDataKind[], range: ClearDataRange) => {
    const { views } = resolveWindowContext(e)
    const list = Array.isArray(kinds) ? kinds : []
    const cutoff = rangeToCutoff(range ?? 'all')
    const profileId = activeProfileOf(views)

    if (list.includes('history')) visitsRepo.clear(profileId, cutoff)
    if (list.includes('downloads')) downloadsRepo.clear(profileId, cutoff)

    // Cookies/cache : l'API Electron ne filtre pas par date (tout ou rien).
    const sessionKinds = list.filter((k): k is 'cache' | 'cookies' => k === 'cache' || k === 'cookies')
    if (sessionKinds.length > 0) {
      const isPrivate = activeProfileRecordOf(views)?.isPrivate ?? false
      await clearBrowsingData(webPartitionForProfile(profileId, isPrivate), sessionKinds)
    }
  })

  ipcMain.handle(CH.settingsChooseDownloadDir, (e) => chooseDirectory(resolveWindowContext(e).win))

  ipcMain.handle(CH.settingsReset, (e) => {
    const { views } = resolveWindowContext(e)
    const next = resetSettings()
    const isPrivate = activeProfileRecordOf(views)?.isPrivate ?? false
    applyProxy(webPartitionForProfile(activeProfileOf(views), isPrivate))
    views.applyZoomToAll()
    void router.refreshStatus()
    return next
  })

  ipcMain.handle(CH.previewsCleanup, () => cleanupPreviews())

  ipcMain.handle(CH.performanceStats, async (e) => {
    const { liveViews, totalMemoryKB } = resolveWindowContext(e).views.getStats()
    const previewsDirBytes = await previewsDirSize()
    return { liveViews, totalMemoryKB, previewsDirBytes }
  })

  // ─── Moteurs de recherche personnalisés ──────────────────────────────────────

  ipcMain.handle(CH.searchEnginesList, () => searchEnginesRepo.list())
  ipcMain.handle(CH.searchEnginesCreate, (_e, label: string, url: string) => {
    if (!url.includes('%s')) throw new Error("L'URL doit contenir %s pour la requête.")
    return searchEnginesRepo.create((label || 'Moteur').slice(0, 60), url.trim())
  })
  ipcMain.handle(CH.searchEnginesRemove, (_e, id: string) => searchEnginesRepo.remove(id))

  // ─── Drapeaux (façade chrome://flags) ────────────────────────────────────────

  ipcMain.handle(CH.flagsGet, () => readFlags())

  ipcMain.handle(CH.flagsSet, (_e, id: string, value: boolean) => writeFlags({ [id]: Boolean(value) }))

  ipcMain.on(CH.appRelaunch, () => relaunchApp())

  ipcMain.on(CH.appOpenExternal, (_e, url: string) => {
    // Seuls les schémas sûrs : liens web, pages de réglages Windows, et mailto
    // (« Signaler un problème », AppMenuPopoverCard.tsx — silencieusement
    // filtré et donc jamais ouvert avant cet ajout, `mailto:` ne correspondait
    // à aucun des deux schémas déjà acceptés).
    if (/^(https?:|ms-settings:|mailto:)/i.test(url)) void shell.openExternal(url)
  })

  ipcMain.on(CH.appQuit, () => {
    // Marque un VRAI quitter avant `app.quit()` — sans ça, le gestionnaire
    // `close` de la fenêtre (main/index.ts) interprèterait ce quitter comme un
    // simple clic sur le bouton X et se contenterait de minimiser si le
    // réglage `minimizeOnClose` est activé, rendant ce menu inopérant.
    markQuitting()
    app.quit()
  })

  ipcMain.on(CH.appNewWindow, (e) => {
    const { views } = resolveWindowContext(e)
    createSecondaryContentWindow(activeProfileOf(views), false, undefined, router)
  })

  ipcMain.handle(CH.reportSend, (_e, subject: string, body: string, attachmentPaths?: string[]) =>
    sendBugReport(
      String(subject ?? '').slice(0, 200),
      String(body ?? '').slice(0, 10_000),
      Array.isArray(attachmentPaths) ? attachmentPaths.slice(0, 10).map(String) : []
    )
  )

  ipcMain.handle(
    CH.reportChooseAttachments,
    async (e): Promise<{ path: string; name: string; size: number }[]> => {
      const { win } = resolveWindowContext(e)
      const result = await dialog.showOpenDialog(win, {
        title: 'Joindre des fichiers',
        properties: ['openFile', 'multiSelections']
      })
      if (result.canceled) return []
      return result.filePaths.map((path) => {
        let size = 0
        try {
          size = statSync(path).size
        } catch {
          // Fichier devenu inaccessible entre la sélection et cette lecture — sans conséquence, `size` reste 0.
        }
        return { path, name: basename(path), size }
      })
    }
  )

  ipcMain.handle(CH.backgroundChooseImage, async (e): Promise<{ filename: string; dataUrl: string } | null> => {
    const filename = await chooseAndSaveAvatarImage(resolveWindowContext(e).win)
    if (!filename) return null
    const dataUrl = avatarImageDataUrl(filename)
    return dataUrl ? { filename, dataUrl } : null
  })

  ipcMain.handle(CH.backgroundImageDataUrl, (_e, filename: string) => avatarImageDataUrl(String(filename ?? '')))

  ipcMain.on(CH.appSetTitle, (e, title: string) => {
    resolveWindowContext(e).win.setTitle(String(title ?? '').trim().slice(0, 80) || 'ÆTHER')
  })

  // Menu principal (façon Chrome/Edge/Brave) — bulle DOM dans le popup natif
  // (voir FavoritesFolderPopoverCard pour le même patron), PAS un menu natif
  // `Menu.buildFromTemplate` : un menu natif ne peut pas être positionné avec
  // précision (Electron n'expose aucun moyen d'interroger sa largeur réelle
  // avant affichage — plusieurs tentatives d'estimation manuelle se sont
  // révélées peu fiables, cf. mémoire du projet). Une bulle DOM mesure sa
  // vraie taille (ResizeObserver, voir PopoverRoot.tsx) et se positionne
  // exactement — même mécanisme fiable que la bulle de dossier de favoris.
  // Chaque clic relaie une commande déjà gérée par `runCommand` côté renderer
  // (même relais que les raccourcis clavier globaux).
  ipcMain.on(CH.appMenuRunCommand, (e, cmd: ShortcutCommand) => {
    const { win } = resolveWindowContext(e)
    hidePopoverWindow(win)
    sendTo(win, CH.shortcut, cmd)
  })

  // ─── Téléchargements ──────────────────────────────────────────────────────────

  ipcMain.handle(CH.downloadsList, (e): DownloadEntry[] =>
    downloadsRepo.listByProfile(activeProfileOf(resolveWindowContext(e).views)).map((d) => ({
      ...d,
      // Vérifié à la demande (pas de veille filesystem) : suffisant pour
      // signaler un fichier supprimé dès qu'on regarde le panneau.
      fileExists: d.state !== 'completed' || existsSync(d.path)
    }))
  )

  ipcMain.handle(CH.downloadsClear, (e, sinceTs: number | null) => {
    downloadsRepo.clear(activeProfileOf(resolveWindowContext(e).views), sinceTs)
  })

  ipcMain.handle(CH.downloadsCancel, (_e, id: string) => {
    liveDownloads.get(id)?.cancel()
  })

  ipcMain.handle(CH.downloadsOpenFile, async (e, id: string) => {
    const entry = downloadsRepo.listByProfile(activeProfileOf(resolveWindowContext(e).views)).find((d) => d.id === id)
    if (entry?.path && existsSync(entry.path)) await shell.openPath(entry.path)
  })

  ipcMain.handle(CH.downloadsShowInFolder, (e, id: string) => {
    const entry = downloadsRepo.listByProfile(activeProfileOf(resolveWindowContext(e).views)).find((d) => d.id === id)
    if (entry?.path) shell.showItemInFolder(entry.path)
  })

  ipcMain.handle(CH.downloadsRemove, (_e, id: string) => {
    downloadsRepo.remove(id)
  })

  // ─── Extensions ───────────────────────────────────────────────────────────────

  ipcMain.handle(CH.extensionsList, (e): ExtensionInfo[] => {
    const { views } = resolveWindowContext(e)
    return listExtensions(activeProfileOf(views), views.activePartition())
  })

  ipcMain.handle(CH.extensionsChooseFolder, (e) => chooseExtensionFolder(resolveWindowContext(e).win))

  ipcMain.handle(CH.extensionsAddUnpacked, (e, folderPath: string) => {
    const { views } = resolveWindowContext(e)
    return addUnpackedExtension(activeProfileOf(views), views.activePartition(), String(folderPath))
  })

  ipcMain.handle(CH.extensionsSetEnabled, (e, id: string, enabled: boolean) => {
    const { views } = resolveWindowContext(e)
    setExtensionEnabled(activeProfileOf(views), views.activePartition(), id, Boolean(enabled))
  })

  ipcMain.handle(CH.extensionsRemove, (e, id: string) => {
    const { views } = resolveWindowContext(e)
    removeExtension(activeProfileOf(views), views.activePartition(), id)
  })

  // Vraie bulle d'une extension (son propre popup.html) — pas notre liste.
  // Toujours ancrée au même endroit (sous l'icône puzzle, haut-droit) via
  // `extensionsMenuAnchors` (par fenêtre) — pas au curseur : le clic vient de
  // l'intérieur de la bulle « liste des extensions » (une AUTRE fenêtre
  // popup), qui pourrait avoir défilé/varier en hauteur selon la ligne cliquée.
  ipcMain.on(CH.extensionsOpenPopup, (e, id: string) => {
    const { win, views } = resolveWindowContext(e)
    hidePopoverWindow(win)
    // `hidePopoverWindow()` masque bien la fenêtre, mais ne prévient jamais le
    // renderer principal (seul `onPageFocused` le fait normalement) — sans ce
    // signal, `ExtensionsButton` (TitleBar.tsx) restait persuadé que la liste
    // était encore ouverte et n'aurait rouvert au clic suivant qu'un `close()`
    // sur une fenêtre déjà masquée.
    sendTo(win, CH.popoverClosed)
    const info = listExtensions(activeProfileOf(views), views.activePartition()).find((ext) => ext.id === id)
    if (!info?.popupUrl) return
    const anchor = extensionsMenuAnchors.get(win.id) ?? (() => {
      const p = screen.getCursorScreenPoint()
      return { rightX: p.x, topY: p.y }
    })()
    openExtensionPopup(win, views.activePartition(), info.popupUrl, anchor)
  })

  ipcMain.on(CH.extensionPopupResize, (e, size: { width: number; height: number }) => {
    resizeExtensionPopup(e.sender, size.width, size.height)
  })

  // Réponse à la popup de confirmation d'installation (voir onInstallExtensionRequested
  // ci-dessous, et WEBSTORE_HOOK_SCRIPT dans viewManager.ts) — déclenche le vrai
  // téléchargement/installation seulement après ce clic explicite de l'utilisateur.
  ipcMain.on(CH.webstoreInstallConfirm, (e, confirmed: boolean) => {
    const { win, views } = resolveWindowContext(e)
    const pending = pendingWebstoreInstalls.get(win.id) ?? null
    pendingWebstoreInstalls.delete(win.id)
    hidePopoverWindow(win)
    if (!pending) return
    const resolveScript = (ok: boolean): string =>
      `window.__aetherResolveInstall && window.__aetherResolveInstall(${JSON.stringify(pending.extensionId)}, ${ok})`
    if (!confirmed) {
      views.runScript(pending.pageId, resolveScript(false))
      return
    }
    void installExtensionFromWebStore(activeProfileOf(views), views.activePartition(), pending.extensionId).then((result) => {
      views.runScript(pending.pageId, resolveScript(result.ok))
      sendTo(win, CH.extensionsInstallResult, result)
    })
  })

  // ─── Mises à jour ───────────────────────────────────────────────────────────

  ipcMain.on(CH.updatesCheck, () => checkForUpdates())
  ipcMain.on(CH.updatesInstall, () => installUpdate())
  ipcMain.handle(CH.updatesGetStatus, () => getUpdateStatus())

  // ─── Popover flottant (fenêtre native) ─────────────────────────────────────

  ipcMain.on(CH.popoverShow, (e, req: PopoverShowRequest) => {
    const { win } = resolveWindowContext(e)
    const content: PopoverContent =
      req.kind === 'favorites-folder'
        ? { kind: 'favorites-folder', folderId: req.folderId, folder: req.folder, items: req.items }
        : req.kind === 'app-menu'
          ? { kind: 'app-menu' }
          : req.kind === 'extensions-menu'
            ? { kind: 'extensions-menu' }
            : req.kind === 'update-ready'
              ? { kind: 'update-ready', version: req.version }
              : { kind: req.kind, pageId: req.pageId }
    if (req.kind === 'extensions-menu') {
      const winBounds = win.getBounds()
      extensionsMenuAnchors.set(win.id, {
        rightX: winBounds.x + req.anchor.x + req.anchor.width,
        topY: winBounds.y + req.anchor.y + req.anchor.height + POPOVER_GAP
      })
    }
    const pinnedRightEdge =
      req.placement === 'below-right' ? win.getBounds().x + req.anchor.x + req.anchor.width : null
    openPopover(win, computePopoverBounds(win, req), content, pinnedRightEdge)
  })

  ipcMain.on(CH.popoverHide, (e) => {
    const { win } = resolveWindowContext(e)
    hidePopoverWindow(win)
    // Sans ce signal, tout bouton dont l'état ouvert/fermé dépend de
    // `popover:onClosed` (menu principal, extensions, favoris, traduction…)
    // reste bloqué sur "ouvert" quand la fermeture vient du CONTENU du popup
    // lui-même (ex. cliquer une action du menu) plutôt que d'un clic extérieur
    // ou d'`onPageFocused` — même bug déjà corrigé une fois pour les extensions
    // (voir CH.extensionsOpenPopup ci-dessus), généralisé ici pour TOUS les popups.
    sendTo(win, CH.popoverClosed)
  })

  ipcMain.on(CH.popoverResize, (e, size: { width: number; height: number }) => {
    resizePopoverWindow(e.sender, size.width, size.height)
  })

  // Le popup natif du contenu d'un dossier de favoris (fenêtre séparée, aucun
  // store partagé) relaie l'ouverture d'un favori via ce canal — la fenêtre
  // principale décide (onglet déjà ouvert → focus, sinon nouvel onglet).
  ipcMain.on(CH.favoritesRequestOpen, (e, url: string) => sendTo(resolveWindowContext(e).win, CH.favoriteOpenRequested, String(url)))
}

/** Effets de bord d'un changement de réglages (zoom, proxy appliqués à chaud). */
function applySideEffects(views: ViewManager, patch: SettingsPatch, before: AppSettings): void {
  if (patch.defaultZoom !== undefined && patch.defaultZoom !== before.defaultZoom) {
    views.applyZoomToAll()
  }
  if (patch.proxyMode !== undefined || patch.proxyRules !== undefined) {
    const isPrivate = activeProfileRecordOf(views)?.isPrivate ?? false
    applyProxy(webPartitionForProfile(activeProfileOf(views), isPrivate))
  }
  if (patch.spellcheckLanguages !== undefined) {
    const isPrivate = activeProfileRecordOf(views)?.isPrivate ?? false
    applySpellcheckLanguages(webPartitionForProfile(activeProfileOf(views), isPrivate))
  }
  // Un fond d'écran personnalisé remplacé (ou retiré) laisse un fichier
  // orphelin dans le dossier géré (avatarsDir) — même filet que pour la
  // suppression/changement d'avatar de profil.
  if (
    patch.backgroundImage !== undefined &&
    before.backgroundImage?.kind === 'custom' &&
    before.backgroundImage.value !== patch.backgroundImage?.value
  ) {
    deleteAvatarImage(before.backgroundImage.value)
  }
}

/** Fabrique le délégué reliant le ViewManager aux événements renderer. */
export function createViewDelegate(
  win: BrowserWindow,
  getViews: () => ViewManager,
  router: AiRouter
): import('./viewManager').ViewManagerDelegate {
  const send = (channel: string, ...args: unknown[]): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  /** État plein écran de la fenêtre avant l'entrée en plein écran HTML5, pour le restaurer en sortant. */
  let preVideoFullscreen: boolean | null = null
  return {
    onFullscreenChange(pageId, isFullscreen) {
      send(CH.pageFullscreenChanged, { id: pageId, fullscreen: isFullscreen })
      // Comme un vrai navigateur : la vidéo plein écran masque aussi la barre des
      // tâches (plein écran natif de la fenêtre), en restaurant l'état antérieur en sortant.
      if (isFullscreen) {
        preVideoFullscreen = win.isFullScreen()
        if (!win.isFullScreen()) win.setFullScreen(true)
      } else {
        if (preVideoFullscreen === false) win.setFullScreen(false)
        preVideoFullscreen = null
      }
    },
    onPageFocused() {
      // Un clic dans une page (WebContentsView) n'atteint jamais le DOM du
      // renderer hôte — seul signal fiable pour fermer un popover ouvert.
      hidePopoverWindow(win)
      send(CH.popoverClosed)
    },
    onZoomChanged(pageId, percent) {
      send(CH.pageZoomChanged, { id: pageId, percent })
    },
    onFindResult(pageId, matches, activeMatchOrdinal) {
      send(CH.pageFindResult, { id: pageId, matches, activeMatchOrdinal })
    },
    onMetaChanged(pageId) {
      const row = pagesRepo.get(pageId)
      if (row) send(CH.pageUpdated, buildPageMeta(getViews(), row))
    },
    onPreviewUpdated(pageId, version) {
      send(CH.pagePreview, { id: pageId, version })
    },
    onOpenRequest(sourcePageId, url) {
      const source = pagesRepo.get(sourcePageId)
      if (!source || !isAllowedUrl(url)) return
      const row = pagesRepo.create({
        spaceId: source.space_id,
        url,
        parentId: sourcePageId,
        canvas: placeCard(source.space_id, sourcePageId)
      })
      getViews().ensureLive(row)
      send(CH.pageOpened, buildPageMeta(getViews(), row))
    },
    onShortcut(cmd) {
      send(CH.shortcut, cmd)
    },
    onTextExtracted(pageId, text) {
      queuePageEmbedding(router, pageId, text)
    },
    onInstallExtensionRequested(pageId, extensionId, name, iconUrl) {
      pendingWebstoreInstalls.set(win.id, { pageId, extensionId })
      const width = 360
      const height = 200
      const wb = win.getBounds()
      // Ancrée en haut de la fenêtre (comme la vraie bulle de confirmation de
      // Chrome, sous la barre d'adresse) — pas centrée verticalement.
      openPopover(
        win,
        {
          x: wb.x + Math.round((wb.width - width) / 2),
          y: wb.y + 72,
          width,
          height
        },
        { kind: 'webstore-confirm', extensionId, name, iconUrl }
      )
    },
    onCreateQrCode(url, title) {
      send(CH.qrCodeShow, { url, title })
    },
    onOpenInNewWindow(url, isPrivate) {
      if (isPrivate) createPrivateWindow(router, url)
      else createSecondaryContentWindow(activeProfileOf(getViews()), false, url, router)
    },
    onVisit(pageId, url, title) {
      const views = getViews()
      // La navigation privée ne laisse aucune trace dans l'historique.
      if (activeProfileRecordOf(views)?.isPrivate) return
      // Filet de sécurité (en plus du filtre déjà posé dans ViewManager) :
      // certaines pages émettent un `did-stop-loading` fantôme pour leur
      // commit initial (`about:blank`, avant même le vrai `loadURL`), URL et
      // titre vides — ça polluait l'historique/les « récents » du champ de
      // recherche avec des lignes sans aucun texte. Jamais une vraie visite.
      if (!url || url === 'about:blank' || url.startsWith('aether:')) return
      const row = pagesRepo.get(pageId)
      visitsRepo.record(activeProfileOf(views), url, title, row?.favicon_url ?? null)
    }
  }
}
