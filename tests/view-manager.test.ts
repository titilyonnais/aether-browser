/**
 * Tests du ViewManager — cœur du cycle de vie des `WebContentsView` (LRU,
 * création paresseuse, éviction mémoire). Electron entièrement mocké (aucune
 * fenêtre réelle, aucun processus renderer) : seule la LOGIQUE de gestion
 * des vues est testée, pas le rendu.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageRow } from '../src/main/db/repositories'

/** Fabrique un faux `WebContents` — surface large mais purement passive pour
 * les tests LRU/éviction, qui n'invoquent jamais les callbacks enregistrées
 * via `.on()` (seule leur EXISTENCE, sans throw, y importe). Les tests de
 * navigation, eux, les REJOUENT : `on` les mémorise dans `handlers`, et
 * `currentUrl` sert de source de vérité pour `getURL()` (que `ViewManager`
 * interroge pour décider du comportement du retour). */
function fakeWebContents() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  /** Historique de navigation modélisé fidèlement, y compris la BIZARRERIE
   * d'Electron dont dépend tout le comportement du bouton retour : un
   * `loadURL()` n'ÉCRASE PAS la branche « avancer » restée au-delà de la
   * position courante (contrairement à une navigation d'adresse dans un vrai
   * navigateur, qui la tronque) — la nouvelle entrée s'empile APRÈS la
   * dernière, laissant les entrées obsolètes accessibles au retour. Sans ce
   * détail, un faux naïf (`canGoBack` toujours faux) ne peut PAS révéler la
   * régression : il détourne le code vers un chemin de repli qui, lui,
   * fonctionne. */
  const history: { entries: string[]; activeIndex: number } = { entries: [], activeIndex: -1 }
  /** Navigation démarrée mais pas encore commitée (page en cours de chargement). */
  const pending: { url: string | null } = { url: null }
  return {
    /** Rejoue un évènement Electron comme si Chromium l'émettait. */
    __emit(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) h(...args)
    },
    /** Simule une navigation RÉELLEMENT commitée (ce que fait Chromium après
     * un `loadURL` réussi) : l'entrée s'empile en fin d'historique, devient
     * l'entrée active, puis `did-navigate` est émis. */
    __commit(url: string) {
      history.entries.push(url)
      history.activeIndex = history.entries.length - 1
      this.__emit('did-navigate', {}, url)
    },
    /** URL réellement affichée — ce que l'utilisateur voit à l'écran. */
    __currentUrl() {
      return history.entries[history.activeIndex] ?? ''
    },
    /** Navigation SAME-DOCUMENT (`pushState`) — ce que font en permanence les
     * pages de résultats Google. Chromium n'émet alors que
     * `did-navigate-in-page`, jamais `will-navigate`. */
    __pushState(url: string) {
      history.entries.push(url)
      history.activeIndex = history.entries.length - 1
      this.__emit('did-navigate-in-page', {}, url, true)
    },
    /** Clic sur un lien DANS la page : Chromium annonce d'abord son intention
     * (`will-navigate`), puis committe. */
    __clickLink(url: string) {
      this.__emit('will-navigate', { preventDefault() {} }, url)
      this.__commit(url)
    },
    /** Historique complet, pour vérifier la purge des entrées périmées. */
    __history() {
      return { entries: [...history.entries], activeIndex: history.activeIndex }
    },
    /** Démarre un chargement SANS le committer : reproduit une page encore en
     * cours de chargement (résultats de recherche lents). `__settle()` le
     * committe plus tard — sauf si `stop()` l'a annulé entre-temps, exactement
     * comme Chromium. */
    __beginPendingLoad(url: string) {
      pending.url = url
    },
    /** Le chargement en vol aboutit (s'il n'a pas été annulé). */
    __settle() {
      if (pending.url === null) return
      const url = pending.url
      pending.url = null
      this.__commit(url)
    },
    isDestroyed: vi.fn(() => false),
    isCrashed: vi.fn(() => false),
    isLoading: vi.fn(() => pending.url !== null),
    stop: vi.fn(() => {
      pending.url = null
    }),
    setAudioMuted: vi.fn(),
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
    getURL: vi.fn(() => history.entries[history.activeIndex] ?? ''),
    getTitle: vi.fn(() => ''),
    getOSProcessId: vi.fn(() => 1234),
    loadURL: vi.fn(async () => undefined),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    }),
    once: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    executeJavaScript: vi.fn(async () => null),
    capturePage: vi.fn(async () => ({
      getSize: () => ({ width: 10, height: 10 }),
      resize: () => ({ toJPEG: () => Buffer.from('') }),
      toJPEG: () => Buffer.from('')
    })),
    navigationHistory: {
      getActiveIndex: vi.fn(() => history.activeIndex),
      getEntryAtIndex: vi.fn((i: number) =>
        history.entries[i] === undefined ? null : { url: history.entries[i] }
      ),
      // Retirer une entrée décale celles au-dessus — et l'entrée active avec,
      // si elle en faisait partie. Reproduit fidèlement, sans quoi le test ne
      // pourrait pas valider la purge.
      removeEntryAtIndex: vi.fn((i: number) => {
        if (i < 0 || i >= history.entries.length || i === history.activeIndex) return false
        history.entries.splice(i, 1)
        if (i < history.activeIndex) history.activeIndex--
        return true
      }),
      canGoBack: vi.fn(() => history.activeIndex > 0),
      canGoForward: vi.fn(() => history.activeIndex < history.entries.length - 1),
      // Un vrai retour d'historique : recule d'une entrée et notifie, comme
      // Chromium — c'est ce qui permet au test de vérifier OÙ l'on atterrit,
      // plutôt que seulement quelle méthode a été appelée.
      goBack: vi.fn(function (this: void) {
        if (history.activeIndex <= 0) return
        history.activeIndex--
        for (const h of handlers.get('did-navigate') ?? []) h({}, history.entries[history.activeIndex])
      }),
      goForward: vi.fn()
    },
    debugger: {
      isAttached: vi.fn(() => false),
      attach: vi.fn(),
      detach: vi.fn(),
      on: vi.fn(),
      sendCommand: vi.fn(async () => ({}))
    }
  }
}

const electronMock = vi.hoisted(() => ({
  app: { getAppMetrics: vi.fn(() => []) },
  dialog: {},
  clipboard: {},
  shell: {},
  WebContentsView: vi.fn()
}))
vi.mock('electron', () => electronMock)

const settingsMock = vi.hoisted(() => ({
  getSettings: vi.fn(() => ({ spellcheck: false, defaultZoom: 1, maxLivePages: 2 }))
}))
vi.mock('../src/main/settings', () => settingsMock)

const pagesRepoMock = vi.hoisted(() => ({
  pagesRepo: {
    get: vi.fn(),
    updateNavigation: vi.fn(),
    updateTitle: vi.fn(),
    updateFavicon: vi.fn(),
    setMuted: vi.fn()
  }
}))
vi.mock('../src/main/db/repositories', () => pagesRepoMock)
vi.mock('../src/main/contentBlocking', () => ({
  noteMainFrameNavigation: vi.fn(),
  siteBlocksPopups: vi.fn(() => false)
}))

vi.mock('../src/main/popoverWindow', () => ({
  hidePopoverWindow: vi.fn(),
  showContextMenuPopover: vi.fn()
}))
vi.mock('../src/main/previews', () => ({
  capturePreview: vi.fn(async () => null),
  deletePreview: vi.fn()
}))
vi.mock('../src/main/webSession', () => ({
  ensurePartitionHardened: vi.fn(),
  webPartitionForProfile: vi.fn(() => 'persist:test')
}))

const { ViewManager } = await import('../src/main/viewManager')

function fakeRow(id: string): PageRow {
  return {
    id,
    space_id: 'space-1',
    url: `https://test.example/${id}`,
    title: '',
    favicon_url: null,
    parent_id: null,
    canvas_x: 0,
    canvas_y: 0,
    canvas_w: 360,
    canvas_h: 260,
    preview_version: 0,
    created_at: Date.now(),
    last_visited_at: Date.now(),
    position: 0,
    muted: 0
  }
}

function fakeWin() {
  return {
    isDestroyed: vi.fn(() => false),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
}

const delegate = {
  onMetaChanged: vi.fn(),
  onPreviewUpdated: vi.fn(),
  onOpenRequest: vi.fn(),
  onShortcut: vi.fn(),
  onFullscreenChange: vi.fn(),
  onPageFocused: vi.fn(),
  onTextExtracted: vi.fn(),
  onZoomChanged: vi.fn(),
  onVisit: vi.fn(),
  onFindResult: vi.fn(),
  onInstallExtensionRequested: vi.fn(),
  onCreateQrCode: vi.fn(),
  onOpenInNewWindow: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  electronMock.WebContentsView.mockImplementation(function FakeWebContentsView() {
    return {
      webContents: fakeWebContents(),
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      setVisible: vi.fn()
    }
  })
  const rows = new Map<string, PageRow>()
  pagesRepoMock.pagesRepo.get.mockImplementation((id: string) => rows.get(id))
  // `navigate()` écrit la cible en base AVANT de lancer le chargement — le
  // mock doit reproduire cette écriture, sinon les tests de navigation ne
  // pourraient pas révéler les bugs qui en découlent (cf. `lastCommittedUrl`).
  pagesRepoMock.pagesRepo.updateNavigation.mockImplementation((id: string, url: string) => {
    const row = rows.get(id)
    if (row) rows.set(id, { ...row, url })
  })
  ;(pagesRepoMock.pagesRepo as unknown as { _rows: Map<string, PageRow> })._rows = rows
})

function seedRow(id: string, url?: string): void {
  const row = fakeRow(id)
  ;(pagesRepoMock.pagesRepo as unknown as { _rows: Map<string, PageRow> })._rows.set(
    id,
    url ? { ...row, url } : row
  )
}

type FakeContents = ReturnType<typeof fakeWebContents>

/** Récupère le faux `WebContents` de la vue vivante d'une page. */
function contentsOf(vm: InstanceType<typeof ViewManager>, id: string): FakeContents {
  return (vm as unknown as { views: Map<string, { webContents: FakeContents }> }).views.get(id)!
    .webContents
}

describe('ViewManager.ensureLive', () => {
  it('crée une vue une seule fois, la réutilise aux appels suivants', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    const row = fakeRow('a')
    const v1 = vm.ensureLive(row)
    const v2 = vm.ensureLive(row)
    expect(v1).toBe(v2)
    expect(electronMock.WebContentsView).toHaveBeenCalledTimes(1)
  })
})

describe('ViewManager — LRU et éviction', () => {
  it('décharge la vue la moins récemment utilisée au-delà du plafond', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a')
    seedRow('b')
    seedRow('c')

    vm.setVisible(['a'])
    vm.setVisible(['b'])
    expect(vm.getRuntime('a').isLive).toBe(true) // maxLivePages=2, 2 vues vivantes, pas encore au-delà

    vm.setVisible(['c'])
    // 3 vues vivantes pour un plafond de 2 : 'a' (la moins récemment
    // touchée, et non visible) est déchargée — 'b' et 'c' restent vivantes.
    expect(vm.getRuntime('a').isLive).toBe(false)
    expect(vm.getRuntime('b').isLive).toBe(true)
    expect(vm.getRuntime('c').isLive).toBe(true)
  })

  it('ne décharge jamais une page actuellement visible', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a')
    seedRow('b')
    seedRow('c')

    // Deux pages visibles simultanément (ex. scission) au plafond de 2 :
    // une troisième vue vivante (créée hors de `setVisible`, ex. préchargement)
    // force une éviction, mais aucune des deux visibles ne doit jamais être
    // la cible — seule 'c', la seule candidate non visible, peut l'être.
    vm.setVisible(['a', 'b'])
    vm.ensureLive(fakeRow('c'))

    expect(vm.getRuntime('a').isLive).toBe(true)
    expect(vm.getRuntime('b').isLive).toBe(true)
  })
})

const NEWTAB = 'aether://newtab'
/** URL telle que Chromium la COMMITTE réellement pour le schéma standard
 * `aether:` — barre oblique finale ajoutée à la normalisation. C'est cette
 * forme-là que `getURL()` renvoie, jamais celle passée à `loadURL`. */
const NEWTAB_COMMITTED = 'aether://newtab/'

describe('ViewManager — retour vers la page d’accueil', () => {
  /** Laisse les promesses en vol se résoudre — `goBack` délègue à `navigate()`,
   * qui attend la fin du chargement initial (`pendingInitialLoad`) avant de
   * lancer le sien, et n'est pas attendu par l'appelant (`void`). */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

  /** Enchaîne « recherche depuis la page d'accueil » de bout en bout : la
   * navigation demandée, puis le commit que Chromium émettrait ensuite. */
  async function search(vm: InstanceType<typeof ViewManager>, id: string, url: string): Promise<void> {
    await vm.navigate(id, url)
    contentsOf(vm, id).__commit(url)
  }

  /** Clic sur la flèche retour, jusqu'à l'atterrissage : `goBack` peut
   * déléguer à `navigate()` (asynchrone, non attendu par l'appelant), dont le
   * chargement doit ensuite être commité comme le ferait Chromium. Renvoie
   * l'URL réellement affichée à l'arrivée — le seul critère qui compte pour
   * l'utilisateur. */
  async function clickBack(vm: InstanceType<typeof ViewManager>, id: string): Promise<string> {
    const wc = contentsOf(vm, id)
    wc.loadURL.mockClear()
    vm.goBack(id)
    await flush()
    // Retour traité par un chargement d'URL (et non par l'historique natif,
    // qui a déjà notifié tout seul) : commite ce chargement.
    // `loadURL` est typé sans paramètre côté faux (le corps n'en a pas besoin) —
    // ses arguments réels se relisent donc via un élargissement explicite.
    const calls = wc.loadURL.mock.calls as unknown as unknown[][]
    const loaded = calls.at(-1)?.[0] as string | undefined
    if (loaded !== undefined) wc.__commit(loaded)
    return wc.__currentUrl()
  }

  it('active le bouton retour après une recherche depuis la page d’accueil', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    contentsOf(vm, 'a').__commit(NEWTAB_COMMITTED)

    expect(vm.getRuntime('a').canGoBack).toBe(false)
    await search(vm, 'a', 'https://google.com/search?q=animal')
    expect(vm.getRuntime('a').canGoBack).toBe(true)
  })

  it('revient à la page d’accueil, PAS à la recherche précédente, après un second cycle', async () => {
    // Régression : Page d'accueil → « animal » → retour → « bill gates » →
    // retour amenait sur la recherche « animal » au lieu de la page d'accueil.
    // `navigate()` écrivant la cible en base avant le chargement, l'URL
    // « précédente » relue depuis la base valait déjà la nouvelle : le drapeau
    // « à un pas d'un nouvel onglet » était effacé par la navigation même qui
    // venait de le poser, et le retour retombait sur l'historique natif — dont
    // la branche « avancer » obsolète n'est jamais purgée par `loadURL()`.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit(NEWTAB_COMMITTED)

    // 1er cycle — recherche « animal », puis retour : déjà correct avant le
    // correctif, mais vérifié pour cadrer la régression du 2nd cycle.
    await search(vm, 'a', 'https://google.com/search?q=animal')
    expect(await clickBack(vm, 'a')).toContain('aether://newtab')

    // 2nd cycle — c'est ICI que la régression se manifestait : on atterrissait
    // sur « animal » au lieu de la page d'accueil.
    await search(vm, 'a', 'https://google.com/search?q=bill+gates')
    expect(await clickBack(vm, 'a')).toContain('aether://newtab')
  })

  it('résiste aux pushState de la page de résultats (cause réelle de la régression)', async () => {
    // Google réécrit son URL par `pushState` en permanence sur ses pages de
    // résultats. Une version précédente recalculait le repère « à un pas de la
    // page d'accueil » à chaque navigation commitée, `did-navigate-in-page`
    // comprise : le repère était donc effacé une fraction de seconde après
    // avoir été posé, et le retour retombait sur l'historique natif — correct
    // par coïncidence au 1er cycle, faux dès le 2nd.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit(NEWTAB_COMMITTED)

    await search(vm, 'a', 'https://google.com/search?q=animal')
    wc.__pushState('https://google.com/search?q=animal&sca_esv=1')
    expect(await clickBack(vm, 'a')).toContain('aether://newtab')

    await search(vm, 'a', 'https://google.com/search?q=bill+gates')
    wc.__pushState('https://google.com/search?q=bill+gates&sca_esv=2')
    expect(await clickBack(vm, 'a')).toContain('aether://newtab')
  })

  it('purge l’historique pour que le bouton LATÉRAL de la souris marche aussi', async () => {
    // Le bouton latéral (comme Alt+Flèche gauche ou un geste tactile) est
    // traité par Chromium LUI-MÊME : il ne passe jamais par `goBack()` du
    // ViewManager. La seule façon de le corriger est que l'historique natif
    // soit lui-même juste — d'où la purge des entrées périmées.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit(NEWTAB_COMMITTED)

    await search(vm, 'a', 'https://google.com/search?q=animal')
    await clickBack(vm, 'a')
    await search(vm, 'a', 'https://google.com/search?q=bill+gates')

    // L'entrée « animal », périmée, ne doit plus se trouver entre la page
    // d'accueil et la page courante.
    const { entries, activeIndex } = wc.__history()
    expect(entries[activeIndex]).toBe('https://google.com/search?q=bill+gates')
    expect(entries[activeIndex - 1]).toContain('aether://newtab')

    // Un retour purement natif (ce que déclenche le bouton de la souris)
    // atterrit donc bien sur la page d'accueil.
    wc.navigationHistory.goBack()
    expect(wc.__currentUrl()).toContain('aether://newtab')
  })

  it('ne se laisse pas « téléporter » par un chargement encore en vol', async () => {
    // Symptôme rapporté : retour à la page d'accueil, puis une seconde plus
    // tard téléportation sur la page qu'on venait de quitter — et seulement
    // « une fois sur deux ». Cause : cliquer « retour » pendant que la page
    // charge encore (banal sur des résultats de recherche lents) laissait la
    // navigation en vol se committer APRÈS le retour, l'écrasant. D'où
    // l'annulation explicite du chargement avant de reculer.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit(NEWTAB_COMMITTED)

    const searchUrl = 'https://google.com/search?q=animal'
    await vm.navigate('a', searchUrl)
    wc.__commit(searchUrl)
    // La page continue de charger (sous-ressources, redirection interne) et
    // une navigation reste en vol au moment du clic.
    wc.__beginPendingLoad(searchUrl)
    expect(wc.isLoading()).toBe(true)

    expect(await clickBack(vm, 'a')).toContain('aether://newtab')

    // Le chargement en vol tente d'aboutir une seconde plus tard : il doit
    // avoir été annulé, donc rester sans effet.
    wc.__settle()
    expect(wc.__currentUrl()).toContain('aether://newtab')
  })

  it('laisse l’historique natif gérer le retour après un clic DANS la page', async () => {
    // Une fois qu'on s'est éloigné d'un pas de plus (lien cliqué), le retour
    // doit redevenir un vrai retour d'historique — pas un saut direct vers la
    // page d'accueil, qui sauterait par-dessus la page intermédiaire.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', NEWTAB)
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit(NEWTAB_COMMITTED)

    await search(vm, 'a', 'https://google.com/search?q=animal')
    // Lien cliqué dans les résultats : Chromium annonce `will-navigate` puis
    // committe, sans jamais passer par `navigate()`.
    wc.__clickLink('https://fr.wikipedia.org/wiki/Animal')

    // Le retour doit ramener aux RÉSULTATS, pas sauter par-dessus jusqu'à la
    // page d'accueil.
    expect(await clickBack(vm, 'a')).toBe('https://google.com/search?q=animal')
    expect(wc.navigationHistory.goBack).toHaveBeenCalled()
  })
})
