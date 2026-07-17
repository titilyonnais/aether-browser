/**
 * Preload — unique pont entre le renderer et le main.
 * Expose `window.aether`, une API typée et minimale via contextBridge.
 * Aucun accès Node/Electron ne fuit vers le renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { CH, type AetherApi, type Unsubscribe } from '@shared/ipc'
import type {
  Bounds,
  BrowsingDataKind,
  CanvasRect,
  CanvasView,
  ChatRequest,
  ClearDataRange,
  FocusState,
  LocalRect,
  OpenPageOptions,
  PageId,
  PopoverShowRequest,
  ProfileId,
  SettingsPatch,
  ShortcutCommand,
  SitePermissionKind,
  SitePermissionState,
  SpaceId
} from '@shared/types'

/** Abonnement typé avec désinscription propre. */
function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AetherApi = {
  window: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMaximize),
    close: () => ipcRenderer.send(CH.winClose),
    isMaximized: () => ipcRenderer.invoke(CH.winIsMaximized),
    onMaximizedChanged: (cb) => on(CH.winMaximizedChanged, cb),
    isFullscreen: () => ipcRenderer.invoke(CH.winIsFullscreen),
    toggleFullscreen: () => ipcRenderer.send(CH.winToggleFullscreen),
    onFullscreenChanged: (cb) => on(CH.winFullscreenChanged, cb)
  },
  state: {
    initial: () => ipcRenderer.invoke(CH.stateInitial)
  },
  profiles: {
    list: () => ipcRenderer.invoke(CH.profileList),
    create: (name: string) => ipcRenderer.invoke(CH.profileCreate, name),
    createPrivate: () => ipcRenderer.invoke(CH.profileCreatePrivate),
    rename: (id: string, name: string) => ipcRenderer.invoke(CH.profileRename, id, name),
    remove: (id: string) => ipcRenderer.invoke(CH.profileRemove, id),
    switch: (id: string) => ipcRenderer.invoke(CH.profileSwitch, id),
    setAvatarIcon: (id: ProfileId, icon: string, color: string) =>
      ipcRenderer.invoke(CH.profileSetAvatarIcon, id, icon, color),
    setAvatarImage: (id: ProfileId) => ipcRenderer.invoke(CH.profileSetAvatarImage, id),
    clearAvatar: (id: ProfileId) => ipcRenderer.invoke(CH.profileClearAvatar, id),
    showMenu: (anchor: LocalRect) => ipcRenderer.send(CH.profileShowMenu, anchor),
    onSwitchRequested: (cb) => on(CH.profileSwitchRequested, cb),
    onCreateRequested: (cb) => on(CH.profileCreateRequested, cb),
    onStartPrivateRequested: (cb) => on(CH.profileStartPrivateRequested, cb),
    onManageRequested: (cb) => on(CH.profileManageRequested, cb),
    onForceSwitched: (cb) => on(CH.profileForceSwitched, cb)
  },
  spaces: {
    create: (name: string) => ipcRenderer.invoke(CH.spaceCreate, name),
    rename: (id: SpaceId, name: string) => ipcRenderer.invoke(CH.spaceRename, id, name),
    remove: (id: SpaceId) => ipcRenderer.invoke(CH.spaceRemove, id),
    setActive: (id: SpaceId) => ipcRenderer.send(CH.spaceSetActive, id),
    updateCanvas: (id: SpaceId, view: CanvasView) => ipcRenderer.send(CH.spaceUpdateCanvas, id, view),
    setHue: (id: SpaceId, hue: number) => ipcRenderer.invoke(CH.spaceSetHue, id, hue),
    duplicate: (id: SpaceId) => ipcRenderer.invoke(CH.spaceDuplicate, id),
    showContextMenu: (id: SpaceId, anchor: LocalRect) => ipcRenderer.send(CH.spaceShowContextMenu, id, anchor),
    onStartRename: (cb) => on(CH.spaceStartRename, cb),
    onUpdated: (cb) => on(CH.spaceUpdated, cb),
    onRemoveRequested: (cb) => on(CH.spaceRemoveRequested, cb)
  },
  pages: {
    open: (opts: OpenPageOptions) => ipcRenderer.invoke(CH.pageOpen, opts),
    close: (id: PageId) => ipcRenderer.invoke(CH.pageClose, id),
    navigate: (id: PageId, url: string) => ipcRenderer.send(CH.pageNavigate, id, url),
    back: (id: PageId) => ipcRenderer.send(CH.pageBack, id),
    forward: (id: PageId) => ipcRenderer.send(CH.pageForward, id),
    reload: (id: PageId) => ipcRenderer.send(CH.pageReload, id),
    stop: (id: PageId) => ipcRenderer.send(CH.pageStop, id),
    setVisible: (ids: PageId[]) => ipcRenderer.send(CH.pageSetVisible, ids),
    setBounds: (id: PageId, bounds: Bounds) => ipcRenderer.send(CH.pageSetBounds, id, bounds),
    setOverlay: (open: boolean) => ipcRenderer.send(CH.pageOverlay, open),
    updateCanvas: (id: PageId, rect: CanvasRect) => ipcRenderer.send(CH.pageUpdateCanvas, id, rect),
    requestPreview: (id: PageId) => ipcRenderer.send(CH.pageRequestPreview, id),
    devtools: (id: PageId) => ipcRenderer.send(CH.pageDevtools, id),
    affinities: (spaceId: SpaceId) => ipcRenderer.invoke(CH.pageAffinities, spaceId),
    context: (id: PageId) => ipcRenderer.invoke(CH.pageContext, id),
    toggleMute: (id: PageId) => ipcRenderer.invoke(CH.pageToggleMute, id),
    reorder: (spaceId: SpaceId, orderedIds: PageId[]) => ipcRenderer.invoke(CH.pageReorder, spaceId, orderedIds),
    getMemoryKB: (id: PageId) => ipcRenderer.invoke(CH.pageGetMemoryKB, id),
    get: (id: PageId) => ipcRenderer.invoke(CH.pageGet, id),
    showContextMenu: (id: PageId, anchor: LocalRect) => ipcRenderer.send(CH.pageShowContextMenu, id, anchor),
    reopenClosed: () => ipcRenderer.invoke(CH.pageReopenClosed),
    setFocusState: (spaceId: SpaceId, state: FocusState) => ipcRenderer.send(CH.pagesSetFocusState, spaceId, state),
    onUpdated: (cb) => on(CH.pageUpdated, cb),
    onOpened: (cb) => on(CH.pageOpened, cb),
    onRemoved: (cb) => on(CH.pageRemoved, cb),
    onPreview: (cb) => on(CH.pagePreview, cb),
    onFullscreenChanged: (cb) => on(CH.pageFullscreenChanged, cb),
    onZoomChanged: (cb) => on(CH.pageZoomChanged, cb),
    zoom: (id: PageId, direction: 'in' | 'out' | 'reset') => ipcRenderer.send(CH.pageZoom, id, direction),
    print: (id: PageId) => ipcRenderer.send(CH.pagePrint, id),
    copy: (id: PageId) => ipcRenderer.send(CH.pageCopy, id),
    paste: (id: PageId) => ipcRenderer.send(CH.pagePaste, id),
    cut: (id: PageId) => ipcRenderer.send(CH.pageCut, id),
    savePage: (id: PageId) => ipcRenderer.send(CH.pageSavePage, id),
    screenshot: (id: PageId) => ipcRenderer.send(CH.pageScreenshot, id),
    findInPage: (id: PageId, text: string, opts: { forward: boolean; findNext: boolean }) =>
      ipcRenderer.send(CH.pageFindInPage, id, text, opts),
    stopFindInPage: (id: PageId, action: 'clearSelection' | 'keepSelection' | 'activateSelection') =>
      ipcRenderer.send(CH.pageStopFindInPage, id, action),
    onFindResult: (cb) => on(CH.pageFindResult, cb),
    translate: (id: PageId, targetLang: string, sourceLang?: string) =>
      ipcRenderer.send(CH.pageTranslate, id, targetLang, sourceLang),
    untranslate: (id: PageId) => ipcRenderer.send(CH.pageUntranslate, id),
    detectLanguage: (id: PageId) => ipcRenderer.invoke(CH.pageDetectLanguage, id)
  },
  favorites: {
    list: () => ipcRenderer.invoke(CH.favoritesList),
    add: (f) => ipcRenderer.invoke(CH.favoritesAdd, f),
    remove: (id: string) => ipcRenderer.invoke(CH.favoritesRemove, id),
    removeByUrl: (url: string) => ipcRenderer.invoke(CH.favoritesRemoveByUrl, url),
    setFolder: (id: string, folderId: string | null) => ipcRenderer.invoke(CH.favoritesSetFolder, id, folderId),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke(CH.favoritesReorder, orderedIds),
    showContextMenu: (id: string, anchor: LocalRect) => ipcRenderer.send(CH.favoriteShowContextMenu, id, anchor),
    onOpenRequested: (cb) => on(CH.favoriteOpenRequested, cb),
    requestOpen: (url: string) => ipcRenderer.send(CH.favoritesRequestOpen, url),
    onManageRequested: (cb) => on(CH.favoritesManageRequested, cb),
    onUpdated: (cb) => on(CH.favoritesUpdated, cb),
    showOverflowMenu: (entries) => ipcRenderer.send(CH.favoritesShowOverflowMenu, entries)
  },
  favoriteFolders: {
    list: () => ipcRenderer.invoke(CH.favoriteFoldersList),
    create: (name: string) => ipcRenderer.invoke(CH.favoriteFoldersCreate, name),
    rename: (id: string, name: string) => ipcRenderer.invoke(CH.favoriteFoldersRename, id, name),
    remove: (id: string) => ipcRenderer.invoke(CH.favoriteFoldersRemove, id),
    onUpdated: (cb) => on(CH.favoriteFoldersUpdated, cb),
    showContextMenu: (id: string, anchor: LocalRect) => ipcRenderer.send(CH.favoriteFoldersShowContextMenu, id, anchor),
    onRenameRequested: (cb) => on(CH.favoriteFolderRenameRequested, cb)
  },
  site: {
    info: (id: PageId) => ipcRenderer.invoke(CH.siteInfo, id),
    setPermission: (id: PageId, kind: SitePermissionKind, state: SitePermissionState) =>
      ipcRenderer.invoke(CH.siteSetPermission, id, kind, state)
  },
  intent: {
    classify: (input: string) => ipcRenderer.invoke(CH.intentClassify, input)
  },
  newTab: {
    weather: () => ipcRenderer.invoke(CH.newTabWeather),
    news: (force?: boolean) => ipcRenderer.invoke(CH.newTabNews, force),
    searchCities: (query: string) => ipcRenderer.invoke(CH.newTabCitySearch, query),
    searchSuggestions: (query: string) => ipcRenderer.invoke(CH.newTabSearchSuggestions, query),
    recentSearches: (limit?: number) => ipcRenderer.invoke(CH.newTabRecentSearches, limit),
    recordSearch: (query: string) => ipcRenderer.send(CH.newTabRecordSearch, query)
  },
  ai: {
    status: () => ipcRenderer.invoke(CH.aiStatus),
    refreshStatus: () => ipcRenderer.invoke(CH.aiRefreshStatus),
    chat: (req: ChatRequest) => ipcRenderer.send(CH.aiChat, req),
    abort: (requestId: string) => ipcRenderer.send(CH.aiAbort, requestId),
    onChunk: (cb) => on(CH.aiChunk, cb),
    onDone: (cb) => on(CH.aiDone, cb),
    onStatusChanged: (cb) => on(CH.aiStatusChanged, cb)
  },
  notes: {
    create: (n) => ipcRenderer.invoke(CH.noteCreate, n),
    update: (id: string, content: string) => ipcRenderer.invoke(CH.noteUpdate, id, content),
    remove: (id: string) => ipcRenderer.invoke(CH.noteRemove, id)
  },
  qrCode: {
    onShow: (cb) => on(CH.qrCodeShow, cb)
  },
  history: {
    search: (query: string, limit?: number) => ipcRenderer.invoke(CH.historySearch, query, limit),
    list: (limit?: number) => ipcRenderer.invoke(CH.historyList, limit),
    clear: (sinceTs: number | null) => ipcRenderer.invoke(CH.historyClear, sinceTs),
    remove: (id: string) => ipcRenderer.invoke(CH.historyRemove, id)
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch: SettingsPatch) => ipcRenderer.invoke(CH.settingsSet, patch),
    clearBrowsingData: (kinds: BrowsingDataKind[], range: ClearDataRange) =>
      ipcRenderer.invoke(CH.settingsClearData, kinds, range),
    chooseDownloadDir: () => ipcRenderer.invoke(CH.settingsChooseDownloadDir),
    reset: () => ipcRenderer.invoke(CH.settingsReset)
  },
  previews: {
    cleanup: () => ipcRenderer.invoke(CH.previewsCleanup)
  },
  performance: {
    stats: () => ipcRenderer.invoke(CH.performanceStats)
  },
  searchEngines: {
    list: () => ipcRenderer.invoke(CH.searchEnginesList),
    create: (label: string, url: string) => ipcRenderer.invoke(CH.searchEnginesCreate, label, url),
    remove: (id: string) => ipcRenderer.invoke(CH.searchEnginesRemove, id)
  },
  flags: {
    get: () => ipcRenderer.invoke(CH.flagsGet),
    set: (id: string, value: boolean) => ipcRenderer.invoke(CH.flagsSet, id, value)
  },
  app: {
    relaunch: () => ipcRenderer.send(CH.appRelaunch),
    openExternal: (url: string) => ipcRenderer.send(CH.appOpenExternal, url),
    quit: () => ipcRenderer.send(CH.appQuit),
    runMenuCommand: (cmd: ShortcutCommand) => ipcRenderer.send(CH.appMenuRunCommand, cmd),
    setTitle: (title: string) => ipcRenderer.send(CH.appSetTitle, title)
  },
  downloads: {
    list: () => ipcRenderer.invoke(CH.downloadsList),
    clear: (sinceTs: number | null) => ipcRenderer.invoke(CH.downloadsClear, sinceTs),
    cancel: (id: string) => ipcRenderer.invoke(CH.downloadsCancel, id),
    openFile: (id: string) => ipcRenderer.invoke(CH.downloadsOpenFile, id),
    showInFolder: (id: string) => ipcRenderer.invoke(CH.downloadsShowInFolder, id),
    remove: (id: string) => ipcRenderer.invoke(CH.downloadsRemove, id),
    onUpdated: (cb) => on(CH.downloadUpdated, cb)
  },
  extensions: {
    list: () => ipcRenderer.invoke(CH.extensionsList),
    chooseFolder: () => ipcRenderer.invoke(CH.extensionsChooseFolder),
    addUnpacked: (folderPath: string) => ipcRenderer.invoke(CH.extensionsAddUnpacked, folderPath),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(CH.extensionsSetEnabled, id, enabled),
    remove: (id: string) => ipcRenderer.invoke(CH.extensionsRemove, id),
    onInstallResult: (cb) => on(CH.extensionsInstallResult, cb),
    openPopup: (id: string) => ipcRenderer.send(CH.extensionsOpenPopup, id)
  },
  shortcuts: {
    onCommand: (cb) => on(CH.shortcut, cb)
  },
  popover: {
    show: (req: PopoverShowRequest) => ipcRenderer.send(CH.popoverShow, req),
    hide: () => ipcRenderer.send(CH.popoverHide),
    reportSize: (size: { width: number; height: number }) =>
      ipcRenderer.send(CH.popoverResize, size),
    onSetContent: (cb) => on(CH.popoverSetContent, cb),
    onClosed: (cb) => on(CH.popoverClosed, cb),
    runContextMenuAction: (id: string) => ipcRenderer.send(CH.contextMenuAction, id),
    confirmWebstoreInstall: (confirmed: boolean) => ipcRenderer.send(CH.webstoreInstallConfirm, confirmed)
  },
  updates: {
    check: () => ipcRenderer.send(CH.updatesCheck),
    install: () => ipcRenderer.send(CH.updatesInstall),
    getStatus: () => ipcRenderer.invoke(CH.updatesGetStatus),
    onStatusChanged: (cb) => on(CH.updatesStatusChanged, cb)
  }
}

if (location.protocol === 'chrome-extension:') {
  // Fenêtre de bulle d'une VRAIE extension (voir main/extensionPopupWindow.ts)
  // — pas notre app, donc AUCUNE exposition de `window.aether` ici (surface
  // d'attaque inutile pour du code tiers). On ne fait QUE mesurer la taille
  // réelle du contenu de l'extension pour que le main ajuste la fenêtre
  // flottante en conséquence, même principe que PopoverRoot.tsx pour nos
  // propres bulles, mais sans bundle applicatif à charger côté page.
  const report = (): void => {
    const width = Math.ceil(document.documentElement.scrollWidth)
    const height = Math.ceil(document.documentElement.scrollHeight)
    if (width > 0 && height > 0) ipcRenderer.send(CH.extensionPopupResize, { width, height })
  }
  window.addEventListener('DOMContentLoaded', () => {
    report()
    new ResizeObserver(report).observe(document.documentElement)
  })
} else {
  contextBridge.exposeInMainWorld('aether', api)
}
