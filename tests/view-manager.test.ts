/**
 * Tests du ViewManager — cœur du cycle de vie des `WebContentsView` (LRU,
 * création paresseuse, éviction mémoire). Electron entièrement mocké (aucune
 * fenêtre réelle, aucun processus renderer) : seule la LOGIQUE de gestion
 * des vues est testée, pas le rendu.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageRow } from '../src/main/db/repositories'
import { siteBlocksPopups } from '../src/main/contentBlocking'

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
    id: 1,
    isDestroyed: vi.fn(() => false),
    isCrashed: vi.fn(() => false),
    isLoading: vi.fn(() => pending.url !== null),
    stop: vi.fn(() => {
      pending.url = null
    }),
    setAudioMuted: vi.fn(),
    setUserAgent: vi.fn(),
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
    getURL: vi.fn(() => history.entries[history.activeIndex] ?? ''),
    getTitle: vi.fn(() => ''),
    getOSProcessId: vi.fn(() => 1234),
    loadURL: vi.fn(async () => undefined),
    savePage: vi.fn(async () => undefined),
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
    debugger: (() => {
      // `isAttached` doit refléter le dernier `attach`/`detach` — comme le
      // fait réellement Electron — sinon `detachDebuggerIfUnused` (partagé
      // entre le crochet Store et le correctif WebAuthn Google) ne peut pas
      // être testé fidèlement.
      let attached = false
      return {
        isAttached: vi.fn(() => attached),
        attach: vi.fn(() => {
          attached = true
        }),
        detach: vi.fn(() => {
          attached = false
        }),
        on: vi.fn(),
        sendCommand: vi.fn(async () => ({}))
      }
    })()
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
  },
  sitePermissionsRepo: {
    get: vi.fn((_profileId: string, _origin: string, _kind: string): 'allow' | 'block' | null => null)
  }
}))
vi.mock('../src/main/db/repositories', () => pagesRepoMock)
vi.mock('../src/main/contentBlocking', () => ({
  noteMainFrameNavigation: vi.fn(),
  noteWebContentsClosed: vi.fn(),
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
  webPartitionForProfile: vi.fn(() => 'persist:test'),
  getGoogleAccountsUserAgent: vi.fn(() => 'UA-GOOGLE-EDG'),
  getPartitionUserAgent: vi.fn(() => 'UA-NORMAL-CHROME')
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
  onOpenInNewWindow: vi.fn(),
  onGoogleSignInBlocked: vi.fn()
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
  pagesRepoMock.sitePermissionsRepo.get.mockImplementation(() => null)
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

describe('ViewManager — savePage/captureScreenshot ne plantent jamais le process', () => {
  // Régression : un rejet non intercepté (clé USB éjectée, disque plein…)
  // dans ces deux méthodes plantait TOUT le process — l'appelant IPC utilise
  // `void` sans `.catch()`, et sur Node 15+ un rejet de promesse non
  // intercepté équivaut à une exception non attrapée que `index.ts` traite
  // comme fatale. Ces tests vérifient que l'échec reste local (une boîte de
  // dialogue d'erreur), pas que la boîte de dialogue elle-même est correcte.
  beforeEach(() => {
    ;(electronMock.dialog as { showSaveDialog?: unknown; showErrorBox?: unknown }).showSaveDialog = vi.fn(
      async () => ({ canceled: false, filePath: 'C:\\fake\\out.html' })
    )
    ;(electronMock.dialog as { showErrorBox?: unknown }).showErrorBox = vi.fn()
  })

  it('savePage : un échec d’écriture affiche une erreur au lieu de rejeter', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a')
    vm.setVisible(['a'])
    contentsOf(vm, 'a').savePage.mockRejectedValueOnce(new Error('disque plein'))

    await expect(vm.savePage('a')).resolves.toBeUndefined()
    expect(
      (electronMock.dialog as unknown as { showErrorBox: ReturnType<typeof vi.fn> }).showErrorBox
    ).toHaveBeenCalledTimes(1)
  })

  it('captureScreenshot : un échec de capture affiche une erreur au lieu de rejeter', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a')
    vm.setVisible(['a'])
    contentsOf(vm, 'a').capturePage.mockRejectedValueOnce(new Error('capture impossible'))

    await expect(vm.captureScreenshot('a')).resolves.toBeUndefined()
    expect(
      (electronMock.dialog as unknown as { showErrorBox: ReturnType<typeof vi.fn> }).showErrorBox
    ).toHaveBeenCalledTimes(1)
  })
})

/** Laisse toutes les micro-tâches (chaînes de promesses) en attente se
 * résoudre — nécessaire depuis que `ensureGoogleAuthShim` est asynchrone
 * (0.90.1), les tests n'ayant pas de prise directe sur la promesse que
 * `ensureLive`/`will-navigate` lancent sans l'attendre eux-mêmes. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Fausse `WebContents` d'une popup native (`overrideBrowserWindowOptions`,
 * `did-create-window`) — surface minimale mais complète (debugger inclus,
 * même patron stateful que `fakeWebContents` ci-dessus) pour couvrir le
 * User-Agent dédié, la détection de refus, ET le correctif WebAuthn, qui
 * s'appliquent tous aux popups de connexion Google. */
function fakePopupWebContents(onOverride?: ReturnType<typeof vi.fn>) {
  let attached = false
  return {
    id: 999,
    setUserAgent: vi.fn(),
    getURL: vi.fn(() => 'https://accounts.google.com/o/oauth2'),
    executeJavaScript: vi.fn(async () => null),
    debugger: {
      isAttached: vi.fn(() => attached),
      attach: vi.fn(() => {
        attached = true
      }),
      detach: vi.fn(() => {
        attached = false
      }),
      sendCommand: vi.fn(async () => ({}))
    },
    on: onOverride ?? vi.fn()
  }
}

describe('ViewManager — setWindowOpenHandler', () => {
  // Régression : un VRAI popup (`window.open(url, nom, 'width=...')`,
  // `disposition === 'new-window'`) était jusqu'ici toujours refusé puis
  // rouvert comme un nouvel onglet ÆTHER totalement indépendant — cassant la
  // relation JS `window.opener`/`postMessage` dont dépendent la quasi-
  // totalité des flux de connexion OAuth (Google en particulier la DÉTECTE
  // et refuse la connexion : « Ce navigateur ou cette application ne sont
  // peut-être pas sécurisés »). Un vrai popup natif doit désormais être
  // autorisé pour ce cas précis, sans rien changer pour un lien normal.
  type OpenHandler = (details: { url: string; disposition: string }) => {
    action: string
    overrideBrowserWindowOptions?: Record<string, unknown>
  }

  function handlerFor(vm: InstanceType<typeof ViewManager>, id: string): OpenHandler {
    const wc = contentsOf(vm, id)
    return (wc.setWindowOpenHandler as unknown as { mock: { calls: [OpenHandler][] } }).mock.calls[0][0]
  }

  it('autorise un vrai popup (disposition new-window) comme une fenêtre native, pas une carte', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.example.com/o/oauth2')
    vm.setVisible(['a'])
    contentsOf(vm, 'a').__commit('https://accounts.example.com/o/oauth2')

    const result = handlerFor(vm, 'a')({ url: 'https://accounts.google.com/signin', disposition: 'new-window' })

    expect(result.action).toBe('allow')
    const opts = result.overrideBrowserWindowOptions as { webPreferences?: Record<string, unknown> }
    expect(opts.webPreferences).toMatchObject({
      partition: vm.activePartition(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    })
    expect(delegate.onOpenRequest).not.toHaveBeenCalled()
  })

  it('continue d’ouvrir un lien normal (target=_blank) comme une carte ÆTHER', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    contentsOf(vm, 'a').__commit('https://example.com')

    const result = handlerFor(vm, 'a')({ url: 'https://example.com/article', disposition: 'foreground-tab' })

    expect(result.action).toBe('deny')
    expect(delegate.onOpenRequest).toHaveBeenCalledWith('a', 'https://example.com/article')
  })

  it('autorise aussi un vrai popup vers accounts.google.com même SANS disposition new-window', () => {
    // Régression du correctif précédent : un `window.open(url)` SANS
    // dimensions explicites (le cas d'une bonne partie du flux de connexion
    // Google) est classé `'foreground-tab'` par Chromium — EXACTEMENT comme
    // un simple lien `target="_blank"` — alors que `window.opener` reste
    // posé dans les deux cas. Se limiter à `disposition === 'new-window'`
    // laissait donc passer le même bris d'opener pour cette variante.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://youtube.com')
    vm.setVisible(['a'])
    contentsOf(vm, 'a').__commit('https://youtube.com')

    const result = handlerFor(vm, 'a')({ url: 'https://accounts.google.com/signin', disposition: 'foreground-tab' })

    expect(result.action).toBe('allow')
    expect(delegate.onOpenRequest).not.toHaveBeenCalled()
  })
})

describe('ViewManager — permission de site « Son »', () => {
  // Régression : `'sound'` existe comme `SitePermissionKind` réglable dans
  // l'UI (Réglages › Autorisations par site) et bien écrite en base, mais
  // rien ne la relisait jamais — la seule coupure de son réellement câblée
  // était le bouton « Muet » manuel par onglet (`pages.muted`), totalement
  // indépendant. Bloquer le son d'un site dans les réglages n'avait donc
  // AUCUN effet réel.
  it('coupe le son au chargement si le site a Son → Bloquer', () => {
    pagesRepoMock.sitePermissionsRepo.get.mockImplementation(
      (_profileId: string, origin: string, kind: string) =>
        origin === 'https://bruyant.example' && kind === 'sound' ? 'block' : null
    )
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://bruyant.example')
    vm.setVisible(['a'])

    expect(contentsOf(vm, 'a').setAudioMuted).toHaveBeenCalledWith(true)
  })

  it('ne coupe pas le son si le site est réglé sur Bloquer mais que la page est sur une AUTRE origine', () => {
    pagesRepoMock.sitePermissionsRepo.get.mockImplementation(
      (_profileId: string, origin: string, kind: string) =>
        origin === 'https://bruyant.example' && kind === 'sound' ? 'block' : null
    )
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://silencieux.example')
    vm.setVisible(['a'])

    expect(contentsOf(vm, 'a').setAudioMuted).toHaveBeenCalledWith(false)
  })

  it('réévalue la permission de site à chaque navigation de premier niveau (changement d’origine)', () => {
    pagesRepoMock.sitePermissionsRepo.get.mockImplementation(
      (_profileId: string, origin: string, kind: string) =>
        origin === 'https://bruyant.example' && kind === 'sound' ? 'block' : null
    )
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://silencieux.example')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    expect(wc.setAudioMuted).toHaveBeenCalledWith(false)

    wc.__commit('https://bruyant.example')
    expect(wc.setAudioMuted).toHaveBeenLastCalledWith(true)
  })

  it('le blocage par site ne masque pas le rétablissement manuel du son (toggleMute)', () => {
    const rows = (pagesRepoMock.pagesRepo as unknown as { _rows: Map<string, PageRow> })._rows
    pagesRepoMock.pagesRepo.setMuted.mockImplementation((id: string, muted: boolean) => {
      const row = rows.get(id)
      if (row) rows.set(id, { ...row, muted: muted ? 1 : 0 })
    })
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    expect(wc.setAudioMuted).toHaveBeenCalledWith(false)

    vm.toggleMute('a')
    expect(wc.setAudioMuted).toHaveBeenLastCalledWith(true)
    vm.toggleMute('a')
    expect(wc.setAudioMuted).toHaveBeenLastCalledWith(false)
  })
})

describe('ViewManager — User-Agent dédié à accounts.google.com', () => {
  // Régression : Google refuse toute connexion à un compte Google depuis un
  // moteur Chromium embarqué (Electron compris), quelle que soit la qualité
  // du reste du User-Agent — un User-Agent dédié à ce host précis (voir
  // webSession.ts) doit être posé AVANT que son document ne charge (jamais
  // après coup : la page lit `navigator.userAgent` dès son premier tour de
  // boucle), et restauré dès qu'on le quitte.
  it('pose le User-Agent Google dès la création de la vue si l’URL initiale y mène', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/signin')
    vm.setVisible(['a'])

    expect(contentsOf(vm, 'a').setUserAgent).toHaveBeenCalledWith('UA-GOOGLE-EDG')
  })

  it('pose le User-Agent normal pour toute autre URL', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])

    expect(contentsOf(vm, 'a').setUserAgent).toHaveBeenCalledWith('UA-NORMAL-CHROME')
  })

  it('bascule vers le User-Agent Google puis revient au normal en quittant le host', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit('https://example.com')
    wc.setUserAgent.mockClear()

    await vm.navigate('a', 'https://accounts.google.com/signin')
    expect(wc.setUserAgent).toHaveBeenLastCalledWith('UA-GOOGLE-EDG')

    wc.__commit('https://accounts.google.com/signin')
    wc.__clickLink('https://example.com/apres-connexion')
    expect(wc.setUserAgent).toHaveBeenLastCalledWith('UA-NORMAL-CHROME')
  })

  it('pose le User-Agent Google sur une VRAIE popup native ouverte vers accounts.google.com', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    const popupWc = fakePopupWebContents()

    wc.__emit('did-create-window', { webContents: popupWc }, { url: 'https://accounts.google.com/o/oauth2' })

    expect(popupWc.setUserAgent).toHaveBeenCalledWith('UA-GOOGLE-EDG')
  })
})

describe('ViewManager — détection du refus explicite de Google', () => {
  // Régression : le contournement de User-Agent (ci-dessus) n'est pas garanti
  // déjouer le blocage — recherche 2026 confirme que Google s'appuie sur
  // plusieurs signaux au-delà du seul User-Agent. Quand le blocage survient
  // malgré tout, ÆTHER doit au moins le détecter pour proposer d'ouvrir la
  // page dans le navigateur par défaut (seul contournement fiable connu).
  it('détecte le chemin dédié signin/rejected et notifie le délégué avec le point d’entrée stable', () => {
    // La page de refus elle-même n'est PAS réutilisable (jetons liés à la
    // requête qui a échoué) : Google répond « 400 » si on la rouvre telle
    // quelle dans un autre navigateur — le délégué reçoit donc le point
    // d'entrée générique de connexion Google, jamais l'URL de refus brute.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/v3/signin/identifier')
    vm.setVisible(['a'])

    contentsOf(vm, 'a').__commit('https://accounts.google.com/v3/signin/rejected')

    expect(delegate.onGoogleSignInBlocked).toHaveBeenCalledWith('a', 'https://accounts.google.com/')
  })

  it('détecte error=disallowed_useragent sur le flux OAuth', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/o/oauth2/auth')
    vm.setVisible(['a'])

    contentsOf(vm, 'a').__commit(
      'https://accounts.google.com/signin/oauth/error?error=disallowed_useragent'
    )

    expect(delegate.onGoogleSignInBlocked).toHaveBeenCalledWith('a', 'https://accounts.google.com/')
  })

  it('ne notifie rien pour une page de connexion Google normale (pas de refus)', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/v3/signin/identifier')
    vm.setVisible(['a'])

    contentsOf(vm, 'a').__commit('https://accounts.google.com/v3/signin/identifier')

    expect(delegate.onGoogleSignInBlocked).not.toHaveBeenCalled()
  })

  it('ne notifie rien pour un autre site, même avec un chemin similaire', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])

    contentsOf(vm, 'a').__commit('https://example.com/signin/rejected')

    expect(delegate.onGoogleSignInBlocked).not.toHaveBeenCalled()
  })

  it('détecte aussi le refus survenant DANS une popup native de connexion', () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    let navigateHandler: ((e: unknown, url: string) => void) | undefined
    const popupWc = fakePopupWebContents(
      vi.fn((event: string, handler: (e: unknown, url: string) => void) => {
        if (event === 'did-navigate') navigateHandler = handler
      })
    )

    wc.__emit('did-create-window', { webContents: popupWc }, { url: 'https://accounts.google.com/o/oauth2' })
    navigateHandler?.(null, 'https://accounts.google.com/v3/signin/rejected')

    expect(delegate.onGoogleSignInBlocked).toHaveBeenCalledWith('a', 'https://accounts.google.com/')
  })
})

describe('ViewManager — suppression du défi WebAuthn/passkey sur accounts.google.com', () => {
  // Signalé par l'utilisateur : une invite Windows native (« Choisir une clé
  // d'accès ») s'ouvrait systématiquement juste après avoir saisi son adresse
  // e-mail sur la page de connexion Google, bloquant le clavier de toute la
  // fenêtre ÆTHER. `navigator.credentials.get({publicKey…}/{identity…})` doit
  // être neutralisé sur ce host précis, jamais ailleurs (ne doit pas casser
  // les passkeys d'un autre site qui les utilise légitimement).
  //
  // Régression du 0.89.0 : une première version injectait au `dom-ready`,
  // trop tard si la page capture sa PROPRE référence à
  // `navigator.credentials.get` dans un script synchrone de `<head>` (avant
  // `dom-ready`) — l'invite restait alors présente en pratique malgré le
  // correctif. Comme `WEBSTORE_HOOK_SCRIPT`, l'injection passe désormais par
  // CDP (`Page.addScriptToEvaluateOnNewDocument`), AVANT le tout premier
  // script de la page, quelle que soit sa façon de capturer la référence.
  it('enregistre le correctif via CDP dès la création de la vue si l’URL initiale y mène', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/v3/signin/identifier')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')

    expect(wc.debugger.attach).toHaveBeenCalledWith('1.3')
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: expect.stringContaining('__aetherGoogleAuthShimmed') }
    )
    // `ensureGoogleAuthShim` est désormais async (0.90.1) — attend que
    // l'enregistrement CDP soit confirmé avant le rattrapage
    // `executeJavaScript`, lui-même attendu avant `loadURL` (voir
    // `syncGoogleAuthShim`) : laisse les micro-tâches en attente se résoudre.
    await flushPromises()

    // Rattrapage pour le document COURANT — le CDP ci-dessus ne s'applique
    // qu'aux PROCHAINS documents.
    expect(wc.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('__aetherGoogleAuthShimmed'))
  })

  it('retarde le VRAI chargement jusqu’à ce que le correctif soit confirmé enregistré (0.90.1)', async () => {
    // Le bug concret de la 0.90.0 : la commande CDP est asynchrone (un
    // aller-retour IPC), mais rien n'empêchait `loadURL` de démarrer AVANT
    // qu'elle ne soit confirmée — l'invite Windows Hello pouvait donc
    // persister même avec l'injection CDP en place. `loadURL` doit
    // maintenant rester en attente tant que l'enregistrement n'est pas
    // confirmé, et ne partir qu'une fois celui-ci résolu.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/v3/signin/identifier')

    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')

    // Rien n'a encore été chargé : la promesse CDP n'a pas eu la chance de
    // se résoudre (mocks asynchrones, aucun flush encore fait).
    expect(wc.loadURL).not.toHaveBeenCalled()

    await flushPromises()

    expect(wc.loadURL).toHaveBeenCalledWith('https://accounts.google.com/v3/signin/identifier')
  })

  it('reprend elle-même un lien cliqué vers accounts.google.com après confirmation du correctif', async () => {
    // Le chemin le plus probable en pratique pour REJOINDRE la page de
    // connexion Google (lien « Se connecter » cliqué depuis YouTube, par
    // exemple) : `will-navigate`, pas `ensureLive`. Chromium annoncerait sinon
    // son intention puis chargerait TOUT DE SUITE, sans attendre la
    // confirmation CDP — la page reprend donc la main elle-même une fois
    // celle-ci résolue (`wc.loadURL`, qui n'émet jamais lui-même
    // `will-navigate` — pas de boucle possible).
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://youtube.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit('https://youtube.com')
    wc.loadURL.mockClear()

    let prevented = false
    wc.__emit('will-navigate', { preventDefault: () => (prevented = true) }, 'https://accounts.google.com/v3/signin/identifier')

    expect(prevented).toBe(true)
    expect(wc.loadURL).not.toHaveBeenCalled()

    await flushPromises()

    expect(wc.loadURL).toHaveBeenCalledWith('https://accounts.google.com/v3/signin/identifier')
  })

  it('reprend elle-même une redirection SERVEUR vers accounts.google.com après confirmation du correctif', async () => {
    // Signalé par l'utilisateur : un clic « Se connecter » depuis YouTube
    // passe par une redirection 302 (will-redirect), pas par un lien HTML
    // classique (will-navigate) — ce chemin précis ne posait jamais le
    // correctif avant que la page Google ne s'exécute. Sémantique
    // `will-redirect` différente de `will-navigate` : la navigation
    // d'origine est déjà « en vol », `wc.stop()` doit la terminer avant la
    // reprise manuelle.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://youtube.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit('https://youtube.com')
    wc.loadURL.mockClear()

    let prevented = false
    wc.__emit(
      'will-redirect',
      { preventDefault: () => (prevented = true) },
      'https://accounts.google.com/v3/signin/identifier',
      302,
      'Found',
      true
    )

    expect(prevented).toBe(true)
    expect(wc.stop).toHaveBeenCalled()
    expect(wc.loadURL).not.toHaveBeenCalled()

    await flushPromises()

    expect(wc.loadURL).toHaveBeenCalledWith('https://accounts.google.com/v3/signin/identifier')
  })

  it('ne touche pas à une redirection vers accounts.google.com déjà bloquée par « Popups et redirections »', async () => {
    // Non-régression : le `return` ajouté après le blocage popups (pour
    // enchaîner sur la branche Google) ne doit pas changer ce comportement
    // déjà existant — un site pour lequel l'utilisateur a bloqué les
    // redirections doit continuer à bloquer aussi une redirection vers
    // accounts.google.com.
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://youtube.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit('https://youtube.com')
    // Laisse le chargement initial (différé depuis la 0.90.1, voir le test
    // ci-dessus) s'exécuter AVANT de réinitialiser le mock — sinon il se
    // déclenche plus tard et fausse l'assertion finale.
    await flushPromises()
    wc.loadURL.mockClear()
    vi.mocked(siteBlocksPopups).mockReturnValueOnce(true)

    let prevented = false
    wc.__emit(
      'will-redirect',
      { preventDefault: () => (prevented = true) },
      'https://accounts.google.com/v3/signin/identifier',
      302,
      'Found',
      true
    )
    await flushPromises()

    expect(prevented).toBe(true)
    expect(wc.stop).not.toHaveBeenCalled()
    expect(wc.loadURL).not.toHaveBeenCalled()
  })

  it("n'enregistre rien pour un autre site (ne doit pas casser un passkey légitime ailleurs)", () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')

    expect(wc.debugger.attach).not.toHaveBeenCalled()
    expect(wc.executeJavaScript).not.toHaveBeenCalledWith(expect.stringContaining('__aetherGoogleAuthShimmed'))
  })

  it('retire le correctif (et détache le débogueur) en quittant accounts.google.com', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://accounts.google.com/v3/signin/identifier')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    wc.__commit('https://accounts.google.com/v3/signin/identifier')

    await vm.navigate('a', 'https://example.com')

    expect(wc.debugger.detach).toHaveBeenCalled()
  })

  it('enregistre aussi le correctif dans une popup native de connexion Google, via CDP', async () => {
    const vm = new ViewManager(fakeWin() as never, delegate)
    seedRow('a', 'https://example.com')
    vm.setVisible(['a'])
    const wc = contentsOf(vm, 'a')
    const popupWc = fakePopupWebContents()

    wc.__emit('did-create-window', { webContents: popupWc }, { url: 'https://accounts.google.com/o/oauth2' })
    await flushPromises()

    expect(popupWc.debugger.attach).toHaveBeenCalledWith('1.3')
    expect(popupWc.debugger.sendCommand).toHaveBeenCalledWith(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: expect.stringContaining('__aetherGoogleAuthShimmed') }
    )
    expect(popupWc.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('__aetherGoogleAuthShimmed'))
  })
})
