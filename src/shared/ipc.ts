/**
 * Contrat IPC : noms de canaux + surface de l'API exposée au renderer
 * par le preload (`window.aether`). Le renderer ne voit jamais ipcRenderer.
 */
import type {
  AffinityLink,
  AiStatus,
  AppSettings,
  Bounds,
  BrowsingDataKind,
  CanvasRect,
  CanvasView,
  ChatChunk,
  ChatDone,
  ChatRequest,
  ClearDataRange,
  CustomSearchEngine,
  DownloadEntry,
  ExtensionInfo,
  ExtensionInstallResult,
  Favorite,
  FavoriteFolder,
  FavoritesOverflowEntry,
  FocusState,
  InitialState,
  IntentResult,
  LocalRect,
  NewTabCitySuggestion,
  NewTabNewsItem,
  NewTabWeather,
  NoteItem,
  OpenPageOptions,
  PageContext,
  PageId,
  PageMeta,
  PopoverContent,
  PopoverShowRequest,
  Profile,
  ProfileId,
  RecentSearch,
  SettingsPatch,
  ShortcutCommand,
  SiteInfo,
  SitePermissionKind,
  SitePermissionState,
  Space,
  SpaceId,
  UpdateStatus,
  Visit,
  Workspace
} from './types'

/** État des drapeaux : map id → activé. */
export type FlagState = Record<string, boolean>

export const CH = {
  // Fenêtre
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:is-maximized',
  winMaximizedChanged: 'win:maximized-changed',
  winIsFullscreen: 'win:is-fullscreen',
  winToggleFullscreen: 'win:toggle-fullscreen',
  winFullscreenChanged: 'win:fullscreen-changed',

  // État initial
  stateInitial: 'state:initial',

  // Profils
  profileList: 'profile:list',
  profileCreate: 'profile:create',
  profileCreatePrivate: 'profile:create-private',
  profileRename: 'profile:rename',
  profileRemove: 'profile:remove',
  profileSwitch: 'profile:switch',
  profileSetAvatarIcon: 'profile:set-avatar-icon',
  profileSetAvatarImage: 'profile:set-avatar-image',
  profileClearAvatar: 'profile:clear-avatar',
  profileChooseAvatarImage: 'profile:choose-avatar-image',
  profileShowMenu: 'profile:show-menu',
  profileSwitchRequested: 'profile:switch-requested',
  profileCreateRequested: 'profile:create-requested',
  profileStartPrivateRequested: 'profile:start-private-requested',
  profileManageRequested: 'profile:manage-requested',

  // Espaces
  spaceCreate: 'space:create',
  spaceRename: 'space:rename',
  spaceRemove: 'space:remove',
  spaceSetActive: 'space:set-active',
  spaceUpdateCanvas: 'space:update-canvas',
  spaceSetHue: 'space:set-hue',
  spaceDuplicate: 'space:duplicate',
  spaceShowContextMenu: 'space:show-context-menu',
  spaceStartRename: 'space:start-rename',
  spaceUpdated: 'space:updated',
  spaceRemoveRequested: 'space:remove-requested',

  // Pages
  pageOpen: 'page:open',
  pageClose: 'page:close',
  pageNavigate: 'page:navigate',
  pageBack: 'page:back',
  pageForward: 'page:forward',
  pageReload: 'page:reload',
  pageStop: 'page:stop',
  pageSetVisible: 'page:set-visible',
  pageSetBounds: 'page:set-bounds',
  pageOverlay: 'page:overlay',
  pageUpdateCanvas: 'page:update-canvas',
  pageRequestPreview: 'page:request-preview',
  pageDevtools: 'page:devtools',
  pageAffinities: 'page:affinities',
  pageContext: 'page:context',
  pageToggleMute: 'page:toggle-mute',
  pageReorder: 'page:reorder',
  pageGetMemoryKB: 'page:get-memory-kb',
  pageGet: 'page:get',
  pageShowContextMenu: 'page:show-context-menu',
  pageReopenClosed: 'page:reopen-closed',
  pageZoom: 'page:zoom',
  pagePrint: 'page:print',
  pageCopy: 'page:copy',
  pagePaste: 'page:paste',
  pageCut: 'page:cut',
  pageSavePage: 'page:save-page',
  pageScreenshot: 'page:screenshot',
  pageFindInPage: 'page:find-in-page',
  pageStopFindInPage: 'page:stop-find-in-page',
  pageFindResult: 'page:find-result',
  pageTranslate: 'page:translate',
  pageUntranslate: 'page:untranslate',
  pageDetectLanguage: 'page:detect-language',
  pagesSetFocusState: 'pages:set-focus-state',
  // Favoris (entité indépendante des pages — voir Favorite dans shared/types)
  favoritesList: 'favorites:list',
  favoritesAdd: 'favorites:add',
  favoritesRemove: 'favorites:remove',
  favoritesRemoveByUrl: 'favorites:remove-by-url',
  favoritesSetFolder: 'favorites:set-folder',
  favoritesReorder: 'favorites:reorder',
  favoritesUpdated: 'favorites:updated',
  favoriteShowContextMenu: 'favorite:show-context-menu',
  favoriteOpenRequested: 'favorite:open-requested',
  /** Envoyé PAR le popup natif du contenu d'un dossier (fenêtre séparée, pas
   * d'accès aux stores) pour relayer l'ouverture d'un favori à la fenêtre
   * principale — celle-ci décide (onglet déjà ouvert → focus, sinon nouveau). */
  favoritesRequestOpen: 'favorites:request-open',
  favoritesManageRequested: 'favorites:manage-requested',
  // Dossiers de favoris (rangement)
  favoriteFoldersList: 'favorite-folders:list',
  favoriteFoldersCreate: 'favorite-folders:create',
  favoriteFoldersRename: 'favorite-folders:rename',
  favoriteFoldersRemove: 'favorite-folders:remove',
  favoriteFoldersUpdated: 'favorite-folders:updated',
  favoriteFoldersShowContextMenu: 'favorite-folders:show-context-menu',
  favoriteFolderRenameRequested: 'favorite-folders:rename-requested',
  favoritesShowOverflowMenu: 'favorites:show-overflow-menu',
  // Événements pages
  pageUpdated: 'page:updated',
  pageOpened: 'page:opened',
  pageRemoved: 'page:removed',
  pagePreview: 'page:preview',
  pageFullscreenChanged: 'page:fullscreen-changed',
  pageZoomChanged: 'page:zoom-changed',

  // Informations de site (HTTPS, certificat, permissions)
  siteInfo: 'site:info',
  siteSetPermission: 'site:set-permission',

  // Intention
  intentClassify: 'intent:classify',

  // Nouvel onglet — widgets
  newTabWeather: 'newtab:weather',
  newTabNews: 'newtab:news',
  newTabCitySearch: 'newtab:city-search',
  newTabSearchSuggestions: 'newtab:search-suggestions',
  newTabRecentSearches: 'newtab:recent-searches',
  newTabRecordSearch: 'newtab:record-search',

  // IA
  aiStatus: 'ai:status',
  aiRefreshStatus: 'ai:refresh-status',
  aiChat: 'ai:chat',
  aiAbort: 'ai:abort',
  aiChunk: 'ai:chunk',
  aiDone: 'ai:done',
  aiStatusChanged: 'ai:status-changed',

  // Notes
  noteCreate: 'note:create',
  noteRemove: 'note:remove',

  // Historique
  historySearch: 'history:search',
  historyList: 'history:list',
  historyClear: 'history:clear',

  // Réglages
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsClearData: 'settings:clear-data',
  settingsChooseDownloadDir: 'settings:choose-download-dir',
  settingsReset: 'settings:reset',

  // Moteurs de recherche personnalisés
  searchEnginesList: 'search-engines:list',
  searchEnginesCreate: 'search-engines:create',
  searchEnginesRemove: 'search-engines:remove',

  // Drapeaux (façade chrome://flags)
  flagsGet: 'flags:get',
  flagsSet: 'flags:set',
  appRelaunch: 'app:relaunch',
  appOpenExternal: 'app:open-external',
  appQuit: 'app:quit',
  /** Envoyé PAR le popup natif du menu principal (fenêtre séparée, mêmes
   * raisons que favorites:request-open) pour relayer une commande de raccourci
   * à la fenêtre principale — celle-ci exécute `runCommand` normalement. */
  appMenuRunCommand: 'app:menu-run-command',
  appSetTitle: 'app:set-title',

  // Téléchargements
  downloadsList: 'downloads:list',
  downloadsClear: 'downloads:clear',
  downloadsCancel: 'downloads:cancel',
  downloadsOpenFile: 'downloads:open-file',
  downloadsShowInFolder: 'downloads:show-in-folder',
  downloadsRemove: 'downloads:remove',
  downloadUpdated: 'download:updated',

  // Extensions
  extensionsList: 'extensions:list',
  extensionsChooseFolder: 'extensions:choose-folder',
  extensionsAddUnpacked: 'extensions:add-unpacked',
  extensionsSetEnabled: 'extensions:set-enabled',
  extensionsRemove: 'extensions:remove',
  extensionsInstallResult: 'extensions:install-result',

  // Raccourcis relayés depuis les pages web
  shortcut: 'shortcut',

  // Popover flottant (fenêtre native — infos de site, aperçu d'onglet)
  popoverShow: 'popover:show',
  popoverHide: 'popover:hide',
  popoverResize: 'popover:resize',
  popoverSetContent: 'popover:set-content',
  popoverClosed: 'popover:closed',
  /** Depuis la bulle de menu contextuel générique (ContextMenuPopoverCard) :
   * exécute l'action associée à cet id de ligne (voir showContextMenuPopover
   * dans popoverWindow.ts, qui garde la vraie callback côté main). */
  contextMenuAction: 'context-menu:action',
  /** Depuis la bulle de confirmation d'installation (Ajouter l'extension/Annuler). */
  webstoreInstallConfirm: 'webstore:install-confirm',

  // Mises à jour (electron-updater, Réglages › À propos)
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesGetStatus: 'updates:get-status',
  updatesStatusChanged: 'updates:status-changed'
} as const

export type Unsubscribe = () => void

/** API complète exposée au renderer via contextBridge. */
export interface AetherApi {
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChanged(cb: (maximized: boolean) => void): Unsubscribe
    /** Plein écran natif de la fenêtre (F11) — masque aussi la barre des tâches. */
    isFullscreen(): Promise<boolean>
    toggleFullscreen(): void
    onFullscreenChanged(cb: (fullscreen: boolean) => void): Unsubscribe
  }
  state: {
    initial(): Promise<InitialState>
  }
  profiles: {
    list(): Promise<Profile[]>
    create(name: string): Promise<Profile>
    /** Crée et bascule immédiatement vers un profil de navigation privée éphémère. */
    createPrivate(): Promise<{ profile: Profile; workspace: Workspace }>
    rename(id: ProfileId, name: string): Promise<void>
    /** Supprime un profil ; si c'était l'actif, `switched` porte le nouveau workspace. */
    remove(
      id: ProfileId
    ): Promise<{ profiles: Profile[]; switched: { activeProfileId: ProfileId; workspace: Workspace } | null }>
    /** Bascule de profil : retourne le workspace du profil ciblé (ou null si inchangé). */
    switch(id: ProfileId): Promise<Workspace | null>
    setAvatarIcon(id: ProfileId, icon: string, color: string): Promise<Profile>
    setAvatarImage(id: ProfileId): Promise<Profile | null>
    clearAvatar(id: ProfileId): Promise<Profile>
    /** Affiche le menu natif de bascule de profil, ancré sous le bouton avatar
     * (une `WebContentsView` de page compose toujours au-dessus du DOM — un
     * menu HTML positionné ici serait invisible là où il chevauche la page). */
    showMenu(anchor: LocalRect): void
    onSwitchRequested(cb: (id: ProfileId) => void): Unsubscribe
    onCreateRequested(cb: () => void): Unsubscribe
    onStartPrivateRequested(cb: () => void): Unsubscribe
    onManageRequested(cb: () => void): Unsubscribe
  }
  spaces: {
    create(name: string): Promise<Space>
    rename(id: SpaceId, name: string): Promise<void>
    /** Retourne l'espace de remplacement créé si c'était le dernier, sinon null. */
    remove(id: SpaceId): Promise<Space | null>
    setActive(id: SpaceId): void
    updateCanvas(id: SpaceId, view: CanvasView): void
    /** Change la couleur d'accent de l'espace. */
    setHue(id: SpaceId, hue: number): Promise<Space | null>
    /** Duplique l'espace (nom + couleur), sans ses pages. */
    duplicate(id: SpaceId): Promise<Space | null>
    /** Affiche la bulle de menu contextuel d'un espace, ancrée au point du clic droit. */
    showContextMenu(id: SpaceId, anchor: LocalRect): void
    onStartRename(cb: (id: SpaceId) => void): Unsubscribe
    /** Un espace a été créé/modifié depuis le menu contextuel (couleur, duplication, nouveau). */
    onUpdated(cb: (space: Space) => void): Unsubscribe
    /** Dissolution demandée depuis le menu contextuel (déjà confirmée côté main). */
    onRemoveRequested(cb: (id: SpaceId) => void): Unsubscribe
  }
  pages: {
    open(opts: OpenPageOptions): Promise<PageMeta>
    close(id: PageId): Promise<void>
    navigate(id: PageId, url: string): void
    back(id: PageId): void
    forward(id: PageId): void
    reload(id: PageId): void
    stop(id: PageId): void
    /** Déclare les pages visibles en mode Focus (0, 1 ou 2). */
    setVisible(ids: PageId[]): void
    /** Positionne la vue native d'une page (coordonnées fenêtre). */
    setBounds(id: PageId, bounds: Bounds): void
    /** Un overlay UI est ouvert → masquer/rétablir les vues natives. */
    setOverlay(open: boolean): void
    updateCanvas(id: PageId, rect: CanvasRect): void
    requestPreview(id: PageId): void
    devtools(id: PageId): void
    affinities(spaceId: SpaceId): Promise<AffinityLink[]>
    context(id: PageId): Promise<PageContext | null>
    /** Coupe/rétablit le son de l'onglet. */
    toggleMute(id: PageId): Promise<void>
    /** Réordonne les pages d'un espace (bande de pages en ligne). */
    reorder(spaceId: SpaceId, orderedIds: PageId[]): Promise<void>
    /** Mémoire de travail du processus de rendu (Ko), ou null si indisponible. */
    getMemoryKB(id: PageId): Promise<number | null>
    /** Métadonnées d'une page à la demande — utilisé par la fenêtre popup, qui
     * n'a pas accès au store Zustand de la fenêtre principale (contexte JS séparé). */
    get(id: PageId): Promise<PageMeta | null>
    /** Affiche la bulle de menu contextuel d'un onglet, ancrée au point du clic droit. */
    showContextMenu(id: PageId, anchor: LocalRect): void
    /** Rouvre le dernier onglet fermé (jusqu'à 8 en historique). */
    reopenClosed(): Promise<PageMeta | null>
    /** Persiste l'état Focus d'un espace — restauré au démarrage si startupTabs === 'restore'. */
    setFocusState(spaceId: SpaceId, state: FocusState): void
    onUpdated(cb: (page: PageMeta) => void): Unsubscribe
    onOpened(cb: (page: PageMeta) => void): Unsubscribe
    onRemoved(cb: (id: PageId) => void): Unsubscribe
    onPreview(cb: (p: { id: PageId; version: number }) => void): Unsubscribe
    /** Une page entre/sort du plein écran HTML5 (vidéo…). */
    onFullscreenChanged(cb: (p: { id: PageId; fullscreen: boolean }) => void): Unsubscribe
    /** Niveau de zoom d'une page modifié (Ctrl+±/0, Ctrl+molette) — pourcentage arrondi. */
    onZoomChanged(cb: (p: { id: PageId; percent: number }) => void): Unsubscribe
    /** Zoom déclenché depuis le menu principal (même logique que Ctrl+±/0). */
    zoom(id: PageId, direction: 'in' | 'out' | 'reset'): void
    print(id: PageId): void
    /** Édition — agissent sur l'élément/la sélection ayant le focus dans la page. */
    copy(id: PageId): void
    paste(id: PageId): void
    cut(id: PageId): void
    /** Enregistre la page (HTML complet) via un sélecteur natif. */
    savePage(id: PageId): void
    /** Capture la page visible et propose de l'enregistrer en PNG. */
    screenshot(id: PageId): void
    /** Lance/poursuit une recherche dans la page (barre de recherche locale). */
    findInPage(id: PageId, text: string, opts: { forward: boolean; findNext: boolean }): void
    stopFindInPage(id: PageId, action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void
    onFindResult(cb: (r: { id: PageId; matches: number; activeMatchOrdinal: number }) => void): Unsubscribe
    /** Traduit la page en place. `sourceLang` : 'auto' (détection) ou un code
     * forcé par l'utilisateur si la détection automatique s'est trompée. */
    translate(id: PageId, targetLang: string, sourceLang?: string): void
    /** Revient à la version originale (recharge la page, sans le cookie de traduction). */
    untranslate(id: PageId): void
    /** Meilleure estimation de la langue de la page (attribut `<html lang>`), '' si inconnue. */
    detectLanguage(id: PageId): Promise<string>
  }
  favorites: {
    list(): Promise<Favorite[]>
    /** Ajoute un signet — indépendant de toute page/onglet vivant. */
    add(f: { url: string; title: string; faviconUrl: string | null; spaceId: SpaceId | null }): Promise<Favorite>
    remove(id: string): Promise<void>
    /** Retire le signet correspondant à cette URL, s'il existe (bouton étoile). */
    removeByUrl(url: string): Promise<void>
    /** Range (ou sort d'un dossier avec `null`) un favori. */
    setFolder(id: string, folderId: string | null): Promise<void>
    /** Réordonne les favoris (barre de favoris, glisser-déposer). */
    reorder(orderedIds: string[]): Promise<void>
    /** Affiche la bulle de menu contextuel d'un favori, ancrée au point du clic
     * droit — depuis un popup (dossier de favoris), reste un menu natif : ce
     * clic droit vient d'une AUTRE fenêtre qu'`anchor` ne peut pas décrire. */
    showContextMenu(id: string, anchor: LocalRect): void
    /** « Ouvrir » depuis le menu contextuel — envoie l'URL, la fenêtre
     * principale décide (page déjà ouverte → focus, sinon nouvelle carte). */
    onOpenRequested(cb: (url: string) => void): Unsubscribe
    /** Depuis le popup natif du contenu d'un dossier (fenêtre séparée) :
     * demande à la fenêtre principale d'ouvrir/focaliser cette URL. */
    requestOpen(url: string): void
    /** « Gérer les favoris… » depuis le menu contextuel ou l'icône dédiée. */
    onManageRequested(cb: () => void): Unsubscribe
    /** Un favori a changé depuis un autre contexte (menu natif, autre fenêtre). */
    onUpdated(cb: (favorites: Favorite[]) => void): Unsubscribe
    /** Menu natif listant les favoris/dossiers en débordement de la barre (flèche finale). */
    showOverflowMenu(entries: FavoritesOverflowEntry[]): void
  }
  favoriteFolders: {
    list(): Promise<FavoriteFolder[]>
    create(name: string): Promise<FavoriteFolder>
    rename(id: string, name: string): Promise<void>
    /** Supprime le dossier ; ses favoris redeviennent « sans dossier ». */
    remove(id: string): Promise<void>
    /** Un dossier a été créé/renommé/supprimé depuis un autre contexte (menu natif). */
    onUpdated(cb: (folders: FavoriteFolder[]) => void): Unsubscribe
    /** Affiche la bulle de menu contextuel d'un dossier (Renommer/Supprimer), ancrée au point du clic droit. */
    showContextMenu(id: string, anchor: LocalRect): void
    /** « Renommer » depuis ce menu — pas de saisie de texte possible dans un
     * menu natif, la fenêtre principale doit demander le nouveau nom. */
    onRenameRequested(cb: (id: string) => void): Unsubscribe
  }
  site: {
    /** Infos HTTPS/certificat/permissions pour l'origine de la page donnée. */
    info(id: PageId): Promise<SiteInfo | null>
    setPermission(
      id: PageId,
      kind: SitePermissionKind,
      state: SitePermissionState
    ): Promise<SiteInfo | null>
  }
  intent: {
    classify(input: string): Promise<IntentResult>
  }
  newTab: {
    /** Météo courante (géolocalisation par IP, aucune clé requise) — null si indisponible. */
    weather(): Promise<NewTabWeather | null>
    /** Titres d'actualité récents (flux RSS) — tableau vide si indisponible.
     * `force` ignore le cache 15 min (bouton « actualiser »). */
    news(force?: boolean): Promise<NewTabNewsItem[]>
    /** Autocomplétion de ville (widget météo) — tableau vide si indisponible. */
    searchCities(query: string): Promise<NewTabCitySuggestion[]>
    /** Suggestions de recherche (façon barre d'adresse Chrome) — tableau vide si indisponible. */
    searchSuggestions(query: string): Promise<string[]>
    /** Requêtes tapées récemment (barre de recherche/barre d'intention) —
     * DISSOCIÉ de l'historique de navigation, voir `RecentSearch`. */
    recentSearches(limit?: number): Promise<RecentSearch[]>
    /** Enregistre une requête tapée — appelé au moment où une RECHERCHE (pas
     * une URL directe) est exécutée, depuis la page de nouvel onglet ou la
     * barre d'intention. */
    recordSearch(query: string): void
  }
  ai: {
    status(): Promise<AiStatus>
    refreshStatus(): Promise<AiStatus>
    chat(req: ChatRequest): void
    abort(requestId: string): void
    onChunk(cb: (c: ChatChunk) => void): Unsubscribe
    onDone(cb: (d: ChatDone) => void): Unsubscribe
    onStatusChanged(cb: (s: AiStatus) => void): Unsubscribe
  }
  notes: {
    create(n: {
      spaceId: SpaceId
      pageId: PageId | null
      pageTitle: string | null
      content: string
    }): Promise<NoteItem>
    remove(id: string): Promise<void>
  }
  history: {
    search(query: string, limit?: number): Promise<Visit[]>
    list(limit?: number): Promise<Visit[]>
    /** null = tout effacer, sinon horodatage de début (ms). */
    clear(sinceTs: number | null): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: SettingsPatch): Promise<AppSettings>
    /** Efface les données choisies sur la plage indiquée (façon Chrome). */
    clearBrowsingData(kinds: BrowsingDataKind[], range: ClearDataRange): Promise<void>
    /** Ouvre un sélecteur de dossier natif ; retourne le chemin ou null. */
    chooseDownloadDir(): Promise<string | null>
    /** Réinitialise toutes les préférences (garde clés API & mémoire). */
    reset(): Promise<AppSettings>
  }
  searchEngines: {
    list(): Promise<CustomSearchEngine[]>
    create(label: string, url: string): Promise<CustomSearchEngine>
    remove(id: string): Promise<void>
  }
  flags: {
    get(): Promise<FlagState>
    set(id: string, value: boolean): Promise<FlagState>
  }
  app: {
    /** Redémarre ÆTHER (pour appliquer les drapeaux). */
    relaunch(): void
    /** Ouvre une URL dans l'OS (liens externes, réglages Windows…). */
    openExternal(url: string): void
    quit(): void
    /** Depuis le popup du menu principal (fenêtre séparée) : relaie une
     * commande à exécuter dans la fenêtre principale (même chemin que les
     * raccourcis clavier globaux — voir `runCommand`). */
    runMenuCommand(cmd: ShortcutCommand): void
    /** Renomme la fenêtre OS (barre des tâches, Alt+Tab). */
    setTitle(title: string): void
  }
  downloads: {
    list(): Promise<DownloadEntry[]>
    clear(sinceTs: number | null): Promise<void>
    cancel(id: string): Promise<void>
    openFile(id: string): Promise<void>
    showInFolder(id: string): Promise<void>
    /** Retire l'entrée de l'historique (annule d'abord si en cours, côté renderer). */
    remove(id: string): Promise<void>
    onUpdated(cb: (id: string) => void): Unsubscribe
  }
  extensions: {
    list(): Promise<ExtensionInfo[]>
    chooseFolder(): Promise<string | null>
    addUnpacked(folderPath: string): Promise<ExtensionInfo | null>
    setEnabled(id: string, enabled: boolean): Promise<void>
    remove(id: string): Promise<void>
    /** Résultat d'une installation déclenchée par un clic sur « Installer » du vrai Chrome Web Store. */
    onInstallResult(cb: (result: ExtensionInstallResult) => void): Unsubscribe
  }
  shortcuts: {
    onCommand(cb: (cmd: ShortcutCommand) => void): Unsubscribe
  }
  /** Popover flottant (fenêtre native) — voir src/main/popoverWindow.ts. */
  popover: {
    show(req: PopoverShowRequest): void
    hide(): void
    /** Appelé par le popup lui-même pour ajuster sa taille au contenu réel. */
    reportSize(size: { width: number; height: number }): void
    /** Écouté par le popup pour savoir quoi afficher. */
    onSetContent(cb: (content: PopoverContent) => void): Unsubscribe
    /** Écouté par la fenêtre principale : le main a fermé le popup de son propre
     * chef (clic dans une page — inatteignable en DOM) → resynchroniser l'état local. */
    onClosed(cb: () => void): Unsubscribe
    /** Depuis la bulle de menu contextuel générique : exécute l'action `id`. */
    runContextMenuAction(id: string): void
    /** Depuis la bulle de confirmation d'installation (Chrome Web Store). */
    confirmWebstoreInstall(confirmed: boolean): void
  }
  /** Mises à jour ÆTHER (Réglages › À propos) — voir main/updater.ts. */
  updates: {
    /** Déclenche une vérification manuelle (bouton « Rechercher les mises à jour »). */
    check(): void
    /** Redémarre l'appli et installe la mise à jour déjà téléchargée. */
    install(): void
    /** État courant, pour l'affichage initial avant le premier évènement. */
    getStatus(): Promise<UpdateStatus>
    onStatusChanged(cb: (status: UpdateStatus) => void): Unsubscribe
  }
}
