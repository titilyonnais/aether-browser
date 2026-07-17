/**
 * Actions transverses — l'orchestration entre stores et IPC vit ici,
 * jamais dans les composants ni dans les stores eux-mêmes.
 */
import { buildSearchUrl, resolveInternalRoute } from '@shared/intent'
import type {
  IntentResult,
  PageId,
  PageMeta,
  ProfileId,
  ShortcutCommand,
  SpaceId,
  Workspace
} from '@shared/types'
import { translate } from '@/i18n'
import { useDownloadsStore } from '@/stores/downloads'
import { useFavoriteFoldersStore } from '@/stores/favoriteFolders'
import { useFavoritesStore } from '@/stores/favorites'
import { useMuseStore } from '@/stores/muse'
import { usePagesStore } from '@/stores/pages'
import { useProfilesStore } from '@/stores/profiles'
import { useSearchEnginesStore } from '@/stores/searchEngines'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'
import { debounce, domainOf, uuid } from './utils'

// ─── Traduction (hors composants) ────────────────────────────────────────────

/** `actions.ts` n'est pas un composant/hook : pas de `useT()` possible ici. */
function tShell(key: string, vars?: Record<string, string | number>): string {
  return translate('fr', key, vars)
}

// ─── Initialisation & pont d'événements ─────────────────────────────────────

let bridgeReady = false
let zoomIndicatorTimer: ReturnType<typeof setTimeout> | null = null

/** Suspend la disparition auto du popup de zoom (survol des boutons -/%/+). */
export function holdZoomIndicator(): void {
  if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer)
}

/** Reprogramme la disparition du popup de zoom (fin du survol). */
export function releaseZoomIndicator(): void {
  if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer)
  zoomIndicatorTimer = setTimeout(() => useUiStore.getState().setZoomIndicator(null), 900)
}

export async function initBridge(): Promise<void> {
  if (bridgeReady) return
  bridgeReady = true

  const ui = useUiStore.getState()
  const pages = usePagesStore.getState()
  const muse = useMuseStore.getState()
  const settings = useSettingsStore.getState()

  window.aether.pages.onUpdated((meta) => {
    usePagesStore.getState().upsert(meta)
    if (!meta.isLoading) scheduleAffinityRefresh()
  })

  window.aether.pages.onOpened((meta) => {
    usePagesStore.getState().upsert(meta)
    useUiStore.getState().toast(tShell('shell.toast.newCard', { domain: domainOf(meta.url) }))
  })

  window.aether.pages.onRemoved((id) => usePagesStore.getState().removeLocal(id))

  window.aether.pages.onPreview(({ id, version }) =>
    usePagesStore.getState().bumpPreview(id, version)
  )

  window.aether.ai.onChunk(({ requestId, delta }) =>
    useMuseStore.getState().appendDelta(requestId, delta)
  )

  window.aether.ai.onDone(({ requestId, error, providerUsed }) =>
    useMuseStore.getState().finalize(requestId, error, providerUsed)
  )

  window.aether.ai.onStatusChanged((status) => useSettingsStore.getState().setAiStatus(status))

  window.aether.downloads.onUpdated(() => void refreshDownloads())

  window.aether.shortcuts.onCommand((cmd) => runCommand(cmd))

  window.aether.window.onMaximizedChanged((m) => useUiStore.getState().setMaximized(m))
  window.aether.window.onFullscreenChanged((f) => useUiStore.getState().setWindowFullscreen(f))
  window.aether.pages.onFullscreenChanged(({ id, fullscreen }) =>
    useUiStore.getState().setFullscreenPageId(fullscreen ? id : null)
  )
  window.aether.pages.onZoomChanged(({ id, percent }) => {
    if (id !== getActivePageId()) return
    useUiStore.getState().setZoomIndicator(percent)
    if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer)
    zoomIndicatorTimer = setTimeout(() => useUiStore.getState().setZoomIndicator(null), 1400)
  })


  window.aether.spaces.onUpdated((space) => useSpacesStore.getState().upsert(space))
  window.aether.spaces.onRemoveRequested((id) => void removeSpace(id))

  // Commandes du menu natif de bascule de profil (voir ProfileSwitcher.tsx) —
  // le menu lui-même vit dans le process main, ces actions restent ici pour
  // profiter du rechargement complet du workspace déjà en place.
  window.aether.profiles.onSwitchRequested((id) => void switchProfile(id))
  window.aether.profiles.onCreateRequested(() => void createProfile('Nouveau profil'))
  window.aether.profiles.onStartPrivateRequested(() => void startPrivateBrowsing())
  window.aether.profiles.onManageRequested(() =>
    useUiStore.getState().openOverlay('settings', { section: 'profils' })
  )
  // Une AUTRE fenêtre ÆTHER vient de supprimer le profil que CETTE fenêtre
  // affichait — bascule forcée vers le workspace de remplacement (support
  // multi-fenêtre, voir profileRemove côté main/ipc.ts).
  window.aether.profiles.onForceSwitched(({ activeProfileId, workspace }) =>
    loadWorkspace(activeProfileId, workspace)
  )

  // Menu contextuel d'une image (« Créer un QR code pour cette image ») —
  // le main pousse une cible arbitraire, pas forcément la page active.
  window.aether.qrCode.onShow((target) => {
    useUiStore.getState().setQrTarget(target)
    useUiStore.getState().openOverlay('qr-code')
  })

  // Menu contextuel natif des favoris (voir FavoritesBar.tsx) — même relais
  // que pour les profils : le menu vit dans le main, les actions ici.
  window.aether.favorites.onOpenRequested((url) => void openFavoriteUrl(url))
  window.aether.favorites.onManageRequested(() => useUiStore.getState().openOverlay('favorites'))
  window.aether.favorites.onUpdated((favorites) => useFavoritesStore.getState().hydrate(favorites))
  window.aether.favoriteFolders.onUpdated((folders) => useFavoriteFoldersStore.getState().hydrate(folders))
  // « Renommer » depuis le menu natif d'un dossier — pas de saisie de texte
  // possible dans un menu natif, on la demande ici côté fenêtre principale.
  window.aether.favoriteFolders.onRenameRequested((id) => {
    const folder = useFavoriteFoldersStore.getState().folders.find((f) => f.id === id)
    const name = window.prompt(tShell('shell.favoritesBar.renameFolder'), folder?.name ?? '')
    if (name && name.trim()) void window.aether.favoriteFolders.rename(id, name.trim())
  })

  // Hydratation initiale.
  const initial = await window.aether.state.initial()
  useProfilesStore.getState().hydrate(initial.profiles, initial.activeProfileId)
  useSpacesStore.getState().hydrate(initial.spaces, initial.activeSpaceId)
  pages.hydrate(initial.pages)
  useFavoritesStore.getState().hydrate(initial.favorites)
  useFavoriteFoldersStore.getState().hydrate(initial.favoriteFolders)
  muse.hydrateNotes(initial.notes)
  settings.hydrate(initial.settings, initial.aiStatus, initial.versions)
  // Visibilité des panneaux au lancement — réglages plutôt que le `true`/`true`
  // fixe d'origine du store (celui-ci reste la valeur par défaut de session,
  // Ctrl+B/Ctrl+J continuent de basculer normalement ensuite).
  useUiStore.setState({
    constellationOpen: initial.settings.showConstellationOnLaunch,
    museOpen: initial.settings.showMuseOnLaunch
  })
  ui.setMaximized(await window.aether.window.isMaximized())
  ui.setReady(true)

  // Persiste l'état Focus à chaque changement (clic sur un onglet, vue scindée,
  // fermeture…), quel que soit l'appelant (composants ET actions) — un seul
  // point centralisé plutôt que d'instrumenter chaque site d'appel de `setFocus`.
  // Enregistré AVANT la restauration ci-dessous pour que même le tout premier
  // changement de focus du lancement (nouvel onglet ou restauration) soit
  // capturé. Anti-rebond PAR ESPACE (pas un anti-rebond partagé) : le
  // redimensionnement de la vue scindée (drag) déclenche des changements de
  // `ratio` en rafale, et un anti-rebond unique perdrait la mise à jour d'un
  // espace si un autre change juste après, dans la même fenêtre.
  const focusPersistTimers = new Map<SpaceId, ReturnType<typeof setTimeout>>()
  usePagesStore.subscribe((state, prev) => {
    if (state.focusBySpace === prev.focusBySpace) return
    for (const [spaceId, focus] of Object.entries(state.focusBySpace)) {
      if (prev.focusBySpace[spaceId] === focus) continue
      clearTimeout(focusPersistTimers.get(spaceId))
      focusPersistTimers.set(
        spaceId,
        setTimeout(() => window.aether.pages.setFocusState(spaceId, focus), 300)
      )
    }
  })
  // Annule tout anti-rebond encore en attente à la fermeture de la fenêtre —
  // sinon un changement de focus dans les 300ms précédant la fermeture pouvait
  // déclencher cet envoi APRÈS que le main ait déjà fermé la base (`will-quit`),
  // faisant planter tout le process (`ipcMain.on` est fire-and-forget : une
  // exception synchrone dedans n'est rattrapée nulle part, contrairement à un
  // `.invoke()`). On perd cette toute dernière sauvegarde, sans conséquence
  // réelle (l'état était déjà persisté à l'écriture précédente).
  window.addEventListener('beforeunload', () => {
    for (const timer of focusPersistTimers.values()) clearTimeout(timer)
    focusPersistTimers.clear()
  })

  if (!initial.settings.onboarded) {
    useUiStore.getState().openOverlay('onboarding')
  } else if (initial.settings.startupTabs === 'restore') {
    // Restaure la page qui était au premier plan par espace à la fermeture
    // précédente. Si l'espace actif n'a RIEN à restaurer (tous les onglets
    // fermés avant de quitter, ou premier lancement), on retombe sur un
    // nouvel onglet plutôt que de laisser un Focus vide — mais SEULEMENT
    // dans ce cas précis, jamais en plus d'une restauration réussie (choix
    // EXCLUSIF, pas deux réglages indépendants qui pouvaient se cumuler).
    pages.hydrateFocus(initial.focusBySpace)
    if (usePagesStore.getState().focusOf(initial.activeSpaceId).slots.length === 0) {
      void openUrl('aether://newtab', { target: 'focus' })
    }
  } else {
    // 'newtab' — vraiment repartir de zéro à chaque démarrage, façon Chrome :
    // les pages de l'espace actif à la fermeture précédente sont RÉELLEMENT
    // fermées (pas juste retirées de la vue Focus), sans quoi elles restaient
    // des cartes permanentes dans la bande de pages — vécu par l'utilisateur
    // comme « les mêmes onglets qui rouvrent quand même ». Seul l'espace actif
    // AU LANCEMENT est concerné, jamais les autres espaces (pas de perte de
    // travail sur un espace que l'utilisateur ne regarde même pas au moment où
    // il ferme ÆTHER).
    const activeSpaceId = useSpacesStore.getState().activeSpaceId
    const stalePageIds = activeSpaceId
      ? Object.values(usePagesStore.getState().pages)
          .filter((p) => p.spaceId === activeSpaceId)
          .map((p) => p.id)
      : []
    // `closePage` rouvre lui-même un nouvel onglet dès que l'espace actif se
    // retrouve totalement vide (filet déjà en place, cf. plus bas dans ce
    // fichier) — inutile de le refaire ici SAUF s'il n'y avait déjà rien à fermer.
    for (const id of stalePageIds) await closePage(id)
    if (stalePageIds.length === 0) {
      void openUrl('aether://newtab', { target: 'focus' })
    }
  }

  scheduleAffinityRefresh()
  void refreshDownloads()
}

// ─── Téléchargements ──────────────────────────────────────────────────────────

const lastKnownDownloadState = new Map<string, string>()

async function refreshDownloads(): Promise<void> {
  const entries = await window.aether.downloads.list()
  useDownloadsStore.getState().hydrate(entries)
  for (const d of entries) {
    const prev = lastKnownDownloadState.get(d.id)
    if (prev !== d.state) {
      lastKnownDownloadState.set(d.id, d.state)
      if (prev !== undefined && d.state !== 'progressing') {
        useUiStore
          .getState()
          .toast(
            d.state === 'completed'
              ? tShell('shell.toast.downloadDone', { filename: d.filename })
              : tShell('shell.toast.downloadInterrupted', { filename: d.filename })
          )
      }
    }
  }
}

// ─── Sélecteurs transverses ──────────────────────────────────────────────────

/** Page « active » : slot actif en Focus, sélection en Canvas. */
export function getActivePageId(): PageId | null {
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId) return null
  const ui = useUiStore.getState()
  const focus = usePagesStore.getState().focusOf(spaceId)
  if (ui.mode === 'canvas' && ui.selectedPageId) return ui.selectedPageId
  return focus.slots[focus.activeSlot] ?? focus.slots[0] ?? ui.selectedPageId
}

export function getActivePage(): PageMeta | null {
  const id = getActivePageId()
  return id ? (usePagesStore.getState().pages[id] ?? null) : null
}

// ─── Navigation & pages ──────────────────────────────────────────────────────

export type OpenTarget = 'focus' | 'split' | 'card'

export async function openUrl(
  url: string,
  opts: { target?: OpenTarget; canvasPos?: { x: number; y: number } | null } = {}
): Promise<PageMeta | null> {
  // Façade « chrome:// » : settings/flags/help ouvrent l'équivalent ÆTHER,
  // pas une page web (ces pages « produit » n'existent pas dans le moteur).
  const route = resolveInternalRoute(url)
  if (route) {
    if (route.kind === 'settings') {
      useUiStore.getState().openOverlay('settings', { section: route.section })
    } else if (route.kind === 'downloads') {
      useUiStore.getState().openOverlay('downloads')
    } else {
      useUiStore.getState().openOverlay('guide')
    }
    return null
  }

  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId) return null
  const target = opts.target ?? 'focus'
  try {
    const meta = await window.aether.pages.open({
      url,
      spaceId,
      parentId: getActivePageId(),
      canvasPos: opts.canvasPos ?? null
    })
    usePagesStore.getState().upsert(meta)
    if (target === 'focus') {
      focusPage(meta.id)
    } else if (target === 'split') {
      openInSplit(meta.id)
    } else {
      useUiStore.getState().select(meta.id)
      useUiStore.getState().toast(tShell('shell.toast.cardAdded'))
    }
    scheduleAffinityRefresh()
    return meta
  } catch {
    useUiStore.getState().toast(tShell('shell.toast.cannotOpen'))
    return null
  }
}

/** Amène une page dans le slot actif du mode Focus. */
export function focusPage(id: PageId): void {
  const pages = usePagesStore.getState()
  const page = pages.pages[id]
  if (!page) return
  const spaces = useSpacesStore.getState()
  if (page.spaceId !== spaces.activeSpaceId) {
    spaces.setActiveLocal(page.spaceId)
    window.aether.spaces.setActive(page.spaceId)
  }
  const spaceId = page.spaceId
  const focus = pages.focusOf(spaceId)
  let slots: PageId[]
  if (focus.slots.includes(id)) {
    slots = focus.slots
  } else if (focus.slots.length <= 1) {
    slots = [id]
  } else {
    slots = [...focus.slots]
    slots[focus.activeSlot] = id
  }
  pages.setFocus(spaceId, { slots, activeSlot: slots.indexOf(id) })
  useUiStore.getState().setMode('focus')
  useUiStore.getState().select(id)
}

/** Place une page dans le second slot (vue scindée). */
export function openInSplit(id: PageId): void {
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId) return
  const pages = usePagesStore.getState()
  const focus = pages.focusOf(spaceId)
  const first = focus.slots[0]
  const slots = first && first !== id ? [first, id] : [id]
  pages.setFocus(spaceId, { slots, activeSlot: slots.length - 1 })
  useUiStore.getState().setMode('focus')
  useUiStore.getState().select(id)
}

/** Duplique la page dans une vue scindée (même URL, navigation libre). */
export async function duplicateInSplit(id: PageId): Promise<void> {
  const page = usePagesStore.getState().pages[id]
  if (!page) return
  await openUrl(page.url, { target: 'split' })
}

/** Retire une page du mode Focus sans la fermer (elle reste sur la toile). */
export function dismissSlot(index: number): void {
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId) return
  const pages = usePagesStore.getState()
  const focus = pages.focusOf(spaceId)
  const slots = focus.slots.filter((_, i) => i !== index)
  pages.setFocus(spaceId, { slots, activeSlot: 0 })
}

/** Un favori est une entité indépendante (voir `favorites` en base) : il
 * survit toujours à la fermeture de l'onglet qui l'affichait, comme un vrai
 * signet Chrome. On le reconnaît/bascule par URL, pas par id de page. */
export async function toggleFavorite(id: PageId): Promise<void> {
  const page = usePagesStore.getState().pages[id]
  if (!page) return
  const existing = useFavoritesStore.getState().favorites.find((f) => f.url === page.url)
  try {
    if (existing) {
      await window.aether.favorites.remove(existing.id)
    } else {
      await window.aether.favorites.add({
        url: page.url,
        title: page.title,
        faviconUrl: page.faviconUrl,
        spaceId: page.spaceId
      })
    }
  } catch {
    useUiStore.getState().toast(tShell('shell.toast.favoriteActionFailed'))
  }
}

export async function closePage(id: PageId): Promise<void> {
  usePagesStore.getState().removeLocal(id)
  const ui = useUiStore.getState()
  if (ui.selectedPageId === id) ui.select(null)
  try {
    await window.aether.pages.close(id)
  } catch {
    // Déjà fermée côté main — sans conséquence.
  }
  scheduleAffinityRefresh()

  // Ne jamais laisser l'espace actif totalement vide : sans la moindre page,
  // il n'y a plus aucun moyen d'en rouvrir une (le bouton « + » vit dans la
  // bande de pages, elle-même absente dès qu'il n'y a plus de page) — on
  // atterrit alors sur une page de nouvel onglet, comme à l'ouverture.
  const activeSpaceId = useSpacesStore.getState().activeSpaceId
  if (activeSpaceId) {
    const stillHasPages = Object.values(usePagesStore.getState().pages).some(
      (p) => p.spaceId === activeSpaceId
    )
    if (!stillHasPages) {
      const newTabUrl = useSettingsStore.getState().settings?.newTabUrl ?? ''
      void openUrl(newTabUrl.trim() || 'aether://newtab', { target: 'focus' })
    }
  }
}

/** « Ouvrir » un favori : focus l'onglet déjà ouvert sur cette URL dans
 * l'espace actif s'il existe, sinon ouvre une nouvelle carte (comme Chrome). */
export async function openFavoriteUrl(url: string): Promise<void> {
  const spaceId = useSpacesStore.getState().activeSpaceId
  const existing = Object.values(usePagesStore.getState().pages).find(
    (p) => p.url === url && p.spaceId === spaceId
  )
  if (existing) {
    focusPage(existing.id)
    return
  }
  await openUrl(url)
}

export async function toggleMute(id: PageId): Promise<void> {
  const page = usePagesStore.getState().pages[id]
  if (!page) return
  usePagesStore.getState().upsert({ ...page, muted: !page.muted })
  await window.aether.pages.toggleMute(id)
}

/** Réordonne les pages d'un espace après un glisser dans la bande de pages. */
export async function reorderPages(spaceId: SpaceId, orderedIds: PageId[]): Promise<void> {
  const pages = usePagesStore.getState()
  orderedIds.forEach((id, i) => {
    const page = pages.pages[id]
    if (page) pages.upsert({ ...page, position: i })
  })
  await window.aether.pages.reorder(spaceId, orderedIds)
}

export async function reopenLastClosedPage(): Promise<void> {
  const meta = await window.aether.pages.reopenClosed()
  if (!meta) {
    useUiStore.getState().toast(tShell('shell.toast.noTabToReopen'))
    return
  }
  usePagesStore.getState().upsert(meta)
  focusPage(meta.id)
}

// ─── Espaces ─────────────────────────────────────────────────────────────────

export function switchSpace(id: SpaceId): void {
  useSpacesStore.getState().setActiveLocal(id)
  window.aether.spaces.setActive(id)
  useUiStore.getState().select(null)
  scheduleAffinityRefresh()
}

export async function createSpace(name: string): Promise<SpaceId> {
  const space = await window.aether.spaces.create(name)
  useSpacesStore.getState().upsert(space)
  switchSpace(space.id)
  return space.id
}

export async function renameSpace(id: SpaceId, name: string): Promise<void> {
  useSpacesStore.getState().renameLocal(id, name)
  await window.aether.spaces.rename(id, name)
}

export async function removeSpace(id: SpaceId): Promise<void> {
  const spaces = useSpacesStore.getState()
  const pages = usePagesStore.getState()
  for (const page of pages.bySpace(id)) pages.removeLocal(page.id)
  const replacement = await window.aether.spaces.remove(id)
  spaces.removeLocal(id)
  if (replacement) spaces.upsert(replacement)
  if (spaces.activeSpaceId === id) {
    const next = replacement?.id ?? useSpacesStore.getState().spaces[0]?.id
    if (next) switchSpace(next)
  }
  useUiStore.getState().toast(tShell('shell.toast.spaceDissolved'))
}

export async function duplicateSpace(id: SpaceId): Promise<void> {
  const dup = await window.aether.spaces.duplicate(id)
  if (!dup) return
  useSpacesStore.getState().upsert(dup)
  useUiStore.getState().toast(tShell('shell.toast.spaceDuplicated', { name: dup.name }))
}

export async function setSpaceHue(id: SpaceId, hue: number): Promise<void> {
  const updated = await window.aether.spaces.setHue(id, hue)
  if (updated) useSpacesStore.getState().upsert(updated)
}

// ─── Profils ─────────────────────────────────────────────────────────────────

/** Recharge stores après un changement de profil (workspace du nouveau profil). */
function loadWorkspace(activeProfileId: ProfileId, ws: Workspace): void {
  useProfilesStore.getState().setActiveLocal(activeProfileId)
  // On repart d'un état propre : les fils Muse et le focus appartenaient à l'ancien profil.
  useMuseStore.setState({ messagesBySpace: {} })
  usePagesStore.setState({ focusBySpace: {}, affinities: [] })
  useSpacesStore.getState().hydrate(ws.spaces, ws.activeSpaceId)
  usePagesStore.getState().hydrate(ws.pages)
  useFavoritesStore.getState().hydrate(ws.favorites)
  useFavoriteFoldersStore.getState().hydrate(ws.favoriteFolders)
  useMuseStore.getState().hydrateNotes(ws.notes)
  useUiStore.getState().select(null)
  useUiStore.getState().setMode('focus')
  scheduleAffinityRefresh()
}

export async function switchProfile(id: ProfileId): Promise<void> {
  if (id === useProfilesStore.getState().activeProfileId) return
  const ws = await window.aether.profiles.switch(id)
  if (ws) {
    loadWorkspace(id, ws)
    // Rafraîchit la liste : si on quitte un profil de navigation privée, le
    // main vient de le supprimer (jamais persisté au-delà de sa durée de
    // vie) — sans ce refetch, l'entrée resterait visible dans le store local.
    const profiles = await window.aether.profiles.list()
    useProfilesStore.getState().setProfiles(profiles)
    const name = profiles.find((p) => p.id === id)?.name ?? 'Profil'
    useUiStore.getState().toast(tShell('shell.toast.profileSwitched', { name }))
  }
}

export async function createProfile(name: string): Promise<void> {
  const profile = await window.aether.profiles.create(name)
  useProfilesStore.getState().upsert(profile)
  await switchProfile(profile.id)
}

export async function renameProfile(id: ProfileId, name: string): Promise<void> {
  useProfilesStore.getState().renameLocal(id, name)
  await window.aether.profiles.rename(id, name)
}

export async function removeProfile(id: ProfileId): Promise<void> {
  const { profiles, switched } = await window.aether.profiles.remove(id)
  useProfilesStore.getState().setProfiles(profiles)
  if (switched) loadWorkspace(switched.activeProfileId, switched.workspace)
  useUiStore.getState().toast(tShell('shell.toast.profileRemoved'))
}

/** Ouvre une navigation privée : profil éphémère, session en mémoire, aucune trace. */
export async function startPrivateBrowsing(): Promise<void> {
  const { profile, workspace } = await window.aether.profiles.createPrivate()
  useProfilesStore.getState().upsert(profile)
  loadWorkspace(profile.id, workspace)
  useUiStore.getState().toast(tShell('shell.toast.privateBrowsing'))
}

export async function setProfileAvatarIcon(id: ProfileId, icon: string, color: string): Promise<void> {
  const profile = await window.aether.profiles.setAvatarIcon(id, icon, color)
  useProfilesStore.getState().upsert(profile)
}

export async function setProfileAvatarImage(id: ProfileId): Promise<void> {
  const profile = await window.aether.profiles.setAvatarImage(id)
  if (profile) useProfilesStore.getState().upsert(profile)
}

export async function clearProfileAvatar(id: ProfileId): Promise<void> {
  const profile = await window.aether.profiles.clearAvatar(id)
  useProfilesStore.getState().upsert(profile)
}

// ─── Intention ───────────────────────────────────────────────────────────────

export async function executeIntent(
  result: IntentResult,
  opts: { target?: OpenTarget; canvasPos?: { x: number; y: number } | null } = {}
): Promise<void> {
  const engine = useSettingsStore.getState().settings?.searchEngine ?? 'duckduckgo'
  const custom = useSearchEnginesStore.getState().custom
  const search = (q: string): string => buildSearchUrl(engine, q, custom)
  const target = opts.target ?? 'focus'
  const canvasPos = opts.canvasPos ?? null

  if (result.type === 'url' && result.url) {
    await openUrl(result.url, { target, canvasPos })
    return
  }
  if (result.type === 'search') {
    const q = result.query ?? result.input
    window.aether.newTab.recordSearch(q)
    await openUrl(search(q), { target, canvasPos })
    return
  }
  // Intention complexe.
  const plan = result.plan ?? { kind: 'ask' }
  if (plan.kind === 'compare') {
    await openUrl(search(plan.left), { target: 'focus', canvasPos })
    await openUrl(search(plan.right), { target: 'split' })
    museAsk(
      `Je compare « ${plan.left} » et « ${plan.right} ». Donne-moi une grille de comparaison claire : critères, forces, faiblesses.`,
      { open: false }
    )
    return
  }
  if (plan.kind === 'search-and-ask') {
    await openUrl(search(result.query ?? result.input), { target, canvasPos })
    museAsk(result.input, { open: true })
    return
  }
  museAsk(result.input, { open: true })
}

// ─── Muse ────────────────────────────────────────────────────────────────────

async function buildMuseContext(): Promise<import('@shared/types').MuseContext | null> {
  const space = useSpacesStore.getState().active()
  if (!space) return null
  const context: import('@shared/types').MuseContext = { spaceName: space.name }

  if (useMuseStore.getState().includePageContext) {
    const activeId = getActivePageId()
    if (activeId) {
      const pageContext = await window.aether.pages.context(activeId).catch(() => null)
      if (pageContext) context.page = pageContext
    }
  }
  const selectedId = useUiStore.getState().selectedPageId
  if (selectedId && selectedId !== getActivePageId()) {
    const selected = usePagesStore.getState().pages[selectedId]
    if (selected) context.selection = { title: selected.title || 'Sans titre', url: selected.url }
  }
  return context
}

export async function museSend(text: string): Promise<void> {
  const trimmed = text.trim()
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!trimmed || !spaceId) return
  const muse = useMuseStore.getState()
  if (muse.streamingId) return

  const requestId = uuid()
  const history = (muse.messagesBySpace[spaceId] ?? [])
    .filter((m) => m.status === 'done' && m.content.trim() !== '')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }))
  // Certaines APIs exigent que le fil commence par un message utilisateur.
  while (history.length > 0 && history[0].role === 'assistant') history.shift()

  muse.append(spaceId, { id: uuid(), role: 'user', content: trimmed, status: 'done', provider: null })
  muse.append(spaceId, { id: requestId, role: 'assistant', content: '', status: 'streaming', provider: null })
  muse.setStreaming(requestId)

  const context = await buildMuseContext()
  window.aether.ai.chat({
    requestId,
    messages: [...history, { role: 'user', content: trimmed }],
    context
  })
}

/** Ouvre Muse (optionnel) et envoie une demande. */
export function museAsk(text: string, opts: { open?: boolean } = {}): void {
  if (opts.open !== false) useUiStore.getState().setMuseOpen(true)
  useMuseStore.getState().setTab('chat')
  void museSend(text)
}

export function museAbort(): void {
  const id = useMuseStore.getState().streamingId
  if (id) window.aether.ai.abort(id)
}

export async function pinNote(content: string): Promise<void> {
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId || !content.trim()) return
  const page = getActivePage()
  const note = await window.aether.notes.create({
    spaceId,
    pageId: page?.id ?? null,
    pageTitle: page?.title ?? null,
    content: content.trim()
  })
  useMuseStore.getState().addNote(note)
  useUiStore.getState().toast(tShell('shell.toast.pinnedToNotes'))
}

export async function updateNote(id: string, content: string): Promise<void> {
  const trimmed = content.trim()
  if (!trimmed) return
  useMuseStore.getState().updateNoteContent(id, trimmed)
  await window.aether.notes.update(id, trimmed)
}

export async function removeNote(id: string): Promise<void> {
  useMuseStore.getState().removeNote(id)
  await window.aether.notes.remove(id)
}

// ─── Affinités sémantiques ───────────────────────────────────────────────────

export const scheduleAffinityRefresh = debounce(() => {
  const spaceId = useSpacesStore.getState().activeSpaceId
  if (!spaceId) return
  void window.aether.pages
    .affinities(spaceId)
    .then((links) => usePagesStore.getState().setAffinities(links))
    .catch(() => undefined)
}, 5000)

// ─── Commandes clavier globales ──────────────────────────────────────────────

export function runCommand(cmd: ShortcutCommand): void {
  const ui = useUiStore.getState()
  switch (cmd) {
    case 'intention':
      if (ui.overlay === 'intention') ui.closeOverlay()
      else ui.openOverlay('intention')
      break
    case 'toggle-mode':
      if (ui.overlay === null) ui.toggleMode()
      break
    case 'toggle-constellation':
      ui.toggleConstellation()
      break
    case 'toggle-muse':
      ui.toggleMuse()
      break
    case 'close-page': {
      const id = getActivePageId()
      if (id) void closePage(id)
      break
    }
    case 'settings':
      if (ui.overlay === 'settings') ui.closeOverlay()
      else ui.openOverlay('settings')
      break
    case 'guide':
      if (ui.overlay === 'guide') ui.closeOverlay()
      else ui.openOverlay('guide')
      break
    case 'downloads':
      if (ui.overlay === 'downloads') ui.closeOverlay()
      else ui.openOverlay('downloads')
      break
    case 'private-window':
      void startPrivateBrowsing()
      break
    case 'fullscreen':
      window.aether.window.toggleFullscreen()
      break
    case 'history':
      if (ui.overlay === 'history') ui.closeOverlay()
      else ui.openOverlay('history')
      break
    case 'favorites-manage':
      if (ui.overlay === 'favorites') ui.closeOverlay()
      else ui.openOverlay('favorites')
      break
    case 'clear-data':
      ui.openOverlay('settings', { section: 'donnees' })
      break
    case 'extensions':
      ui.openOverlay('settings', { section: 'extensions' })
      break
    case 'devtools': {
      const id = getActivePageId()
      if (id) window.aether.pages.devtools(id)
      break
    }
    case 'print': {
      const id = getActivePageId()
      if (id) window.aether.pages.print(id)
      break
    }
    case 'zoom-in': {
      const id = getActivePageId()
      if (id) window.aether.pages.zoom(id, 'in')
      break
    }
    case 'zoom-out': {
      const id = getActivePageId()
      if (id) window.aether.pages.zoom(id, 'out')
      break
    }
    case 'zoom-reset': {
      const id = getActivePageId()
      if (id) window.aether.pages.zoom(id, 'reset')
      break
    }
    case 'find-in-page': {
      const id = getActivePageId()
      if (id) useUiStore.getState().openFindBar(id)
      break
    }
    case 'copy': {
      const id = getActivePageId()
      if (id) window.aether.pages.copy(id)
      break
    }
    case 'paste': {
      const id = getActivePageId()
      if (id) window.aether.pages.paste(id)
      break
    }
    case 'cut': {
      const id = getActivePageId()
      if (id) window.aether.pages.cut(id)
      break
    }
    case 'save-page': {
      const id = getActivePageId()
      if (id) window.aether.pages.savePage(id)
      break
    }
    case 'screenshot': {
      const id = getActivePageId()
      if (id) window.aether.pages.screenshot(id)
      break
    }
    case 'copy-link': {
      const page = getActivePage()
      if (page) {
        void navigator.clipboard.writeText(page.url)
        ui.toast(tShell('shell.toast.linkCopied'))
      }
      break
    }
    case 'qr-code': {
      const page = getActivePage()
      if (page) {
        useUiStore.getState().setQrTarget({ url: page.url, title: page.title || domainOf(page.url) })
        ui.openOverlay('qr-code')
      }
      break
    }
    case 'tab-search':
      if (ui.overlay === 'tab-search') ui.closeOverlay()
      else ui.openOverlay('tab-search')
      break
    case 'task-manager':
      if (ui.overlay === 'task-manager') ui.closeOverlay()
      else ui.openOverlay('task-manager')
      break
    case 'rename-window':
      ui.openOverlay('rename-window')
      break
    case 'customize-theme':
      ui.openOverlay('settings', { section: 'apparence' })
      break
    case 'performance-settings':
      ui.openOverlay('settings', { section: 'performance' })
      break
    case 'about':
      ui.openOverlay('settings', { section: 'apropos' })
      break
    case 'translate-page': {
      const page = getActivePage()
      if (!page) break
      if (!/^https?:/.test(page.url)) {
        ui.toast(tShell('shell.toast.pageCannotBeTranslated'))
        break
      }
      const targetLang = (navigator.language || 'fr').split('-')[0]
      window.aether.pages.translate(page.id, targetLang)
      break
    }
  }
}
