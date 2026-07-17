/**
 * Tests du ViewManager — cœur du cycle de vie des `WebContentsView` (LRU,
 * création paresseuse, éviction mémoire). Electron entièrement mocké (aucune
 * fenêtre réelle, aucun processus renderer) : seule la LOGIQUE de gestion
 * des vues est testée, pas le rendu.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageRow } from '../src/main/db/repositories'

/** Fabrique un faux `WebContents` — surface large mais purement passive :
 * les tests LRU/éviction n'invoquent jamais les callbacks enregistrées via
 * `.on()`, seule leur EXISTENCE (pas de throw à l'enregistrement) importe. */
function fakeWebContents() {
  return {
    isDestroyed: vi.fn(() => false),
    isCrashed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    setAudioMuted: vi.fn(),
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
    getURL: vi.fn(() => ''),
    getTitle: vi.fn(() => ''),
    getOSProcessId: vi.fn(() => 1234),
    loadURL: vi.fn(async () => undefined),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    executeJavaScript: vi.fn(async () => null),
    capturePage: vi.fn(async () => ({
      getSize: () => ({ width: 10, height: 10 }),
      resize: () => ({ toJPEG: () => Buffer.from('') }),
      toJPEG: () => Buffer.from('')
    })),
    navigationHistory: {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
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

const pagesRepoMock = vi.hoisted(() => ({ pagesRepo: { get: vi.fn() } }))
vi.mock('../src/main/db/repositories', () => pagesRepoMock)

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
  ;(pagesRepoMock.pagesRepo as unknown as { _rows: Map<string, PageRow> })._rows = rows
})

function seedRow(id: string): void {
  ;(pagesRepoMock.pagesRepo as unknown as { _rows: Map<string, PageRow> })._rows.set(id, fakeRow(id))
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
