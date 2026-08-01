/**
 * Positionnement des bulles — deux garanties distinctes vérifiées ici :
 *
 * 1. `pinnedAnchorFor` (menu contextuel, clic droit) : retournement horizontal
 *    et vertical INDÉPENDANTS selon la place réellement disponible près du
 *    point cliqué, jamais un recalage post-hoc qui « aimante » la bulle au
 *    bord de l'écran en la déconnectant du point cliqué — les 4 règles
 *    demandées explicitement par l'utilisateur (capture à l'appui).
 * 2. `boundsForAnchor` : les bornes initiales produites correspondent
 *    exactement au coin choisi, quel qu'il soit.
 */
import { describe, expect, it, vi } from 'vitest'
import { boundsForAnchor, pinnedAnchorFor, topLeftAnchor } from '../src/main/popoverWindow'

const electronMock = vi.hoisted(() => ({
  BrowserWindow: class {},
  screen: {
    getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }))
  }
}))
vi.mock('electron', () => electronMock)
vi.mock('../src/main/dwm', () => ({ disableNativeWindowTransitions: vi.fn() }))
vi.mock('../src/main/windowFade', () => ({ fadeWindowIn: vi.fn(), fadeWindowOut: vi.fn() }))
vi.mock('../src/main/popoverBackdrop', () => ({ captureAndSendBackdrop: vi.fn() }))

function setWorkArea(area: { x: number; y: number; width: number; height: number }): void {
  electronMock.screen.getDisplayNearestPoint.mockReturnValue({ workArea: area })
  electronMock.screen.getDisplayMatching.mockReturnValue({ workArea: area })
}

describe('pinnedAnchorFor — retournement du menu contextuel', () => {
  it('clic haut-gauche avec de la place : ancre le coin HAUT-GAUCHE de la bulle sur la souris', () => {
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })
    const anchor = pinnedAnchorFor({ x: 100, y: 100 }, { width: 320, height: 160 })
    expect(anchor).toEqual({ x: 'left', y: 'top', point: { x: 100, y: 100 } })
  })

  it("clic bas-gauche de l'écran, pas de place en bas : ancre le coin BAS-GAUCHE sur la souris", () => {
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })
    // 1000 + 160 (hauteur) > 1080 → pas de place en dessous.
    const anchor = pinnedAnchorFor({ x: 100, y: 1000 }, { width: 320, height: 160 })
    expect(anchor).toEqual({ x: 'left', y: 'bottom', point: { x: 100, y: 1000 } })
  })

  it("clic haut-droite tout au bord, pas de place à droite : ancre le coin HAUT-DROIT sur la souris", () => {
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })
    // 1850 + 320 (largeur) > 1920 → pas de place à droite.
    const anchor = pinnedAnchorFor({ x: 1850, y: 100 }, { width: 320, height: 160 })
    expect(anchor).toEqual({ x: 'right', y: 'top', point: { x: 1850, y: 100 } })
  })

  it("clic bas-droite tout au bord, pas de place ni à droite ni en bas : ancre le coin BAS-DROIT sur la souris", () => {
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })
    const anchor = pinnedAnchorFor({ x: 1850, y: 1000 }, { width: 320, height: 160 })
    expect(anchor).toEqual({ x: 'right', y: 'bottom', point: { x: 1850, y: 1000 } })
  })

  it('les deux bascules sont INDÉPENDANTES — pas de place à droite seulement', () => {
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })
    const anchor = pinnedAnchorFor({ x: 1850, y: 500 }, { width: 320, height: 160 })
    expect(anchor.x).toBe('right')
    expect(anchor.y).toBe('top')
  })

  it("tient compte de l'écran qui contient RÉELLEMENT le point (pas toujours (0,0))", () => {
    // Second écran positionné à droite du premier, ex. x ∈ [1920, 3840].
    setWorkArea({ x: 1920, y: 0, width: 1920, height: 1080 })
    const anchor = pinnedAnchorFor({ x: 3800, y: 100 }, { width: 320, height: 160 })
    expect(anchor.x).toBe('right')
  })
})

describe('resizePopoverWindow — intégration', () => {
  // Fenêtres minimales imitant l'API BrowserWindow réellement utilisée par
  // popoverWindow.ts — juste assez pour exercer `openPopover`/`resizePopoverWindow`
  // de bout en bout sans dépendre d'Electron.
  function makeFakeWindow(overrides: Partial<Record<string, unknown>> = {}) {
    const closedHandlers: Array<() => void> = []
    const win = {
      id: Math.floor(Math.random() * 1_000_000),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      destroyed: false,
      visible: false,
      webContents: {
        send: vi.fn(),
        once: (event: string, cb: () => void) => {
          if (event === 'did-finish-load') cb()
        }
      },
      getBounds() {
        return this.bounds
      },
      setBounds(b: { x: number; y: number; width: number; height: number }) {
        this.bounds = b
        this.visible = true
      },
      getContentBounds() {
        return { x: 0, y: 0, width: 1920, height: 1080 }
      },
      isDestroyed() {
        return this.destroyed
      },
      isVisible() {
        return this.visible
      },
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on(event: string, cb: () => void) {
        if (event === 'closed') closedHandlers.push(cb)
      },
      ...overrides
    }
    return win
  }

  it("un menu contextuel plus GRAND que l'estimation initiale se retourne quand même correctement une fois sa vraie taille connue", async () => {
    vi.resetModules()
    const owner = makeFakeWindow()
    const popup = makeFakeWindow({ getParentWindow: () => owner })
    electronMock.BrowserWindow = Object.assign(
      vi.fn(function FakeBrowserWindow() {
        return popup
      }),
      { fromWebContents: () => popup }
    ) as never
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })

    const mod = await import('../src/main/popoverWindow')
    // Estimation (320×160, CONTEXT_MENU_WIDTH/HEIGHT) à x=1650 : 1650+320=1970
    // dépasse l'écran (1920) → décide « retourné à droite » dès l'ouverture.
    // La taille RÉELLEMENT mesurée ensuite (100×60) tient très bien à DROITE
    // du clic (1650+100=1750 < 1920) — sans le recalcul dynamique, l'ancrage
    // resterait figé sur la mauvaise décision de l'estimation et le menu se
    // ferait recaler en bloc contre le bord de l'écran (bug signalé).
    const point = { x: 1650, y: 100 }
    mod.showContextMenuPopover(owner as never, { x: 1650, y: 98, width: 0, height: 0 }, [], {})
    mod.resizePopoverWindow(popup.webContents as never, 100 + 8, 60 + 8)
    // Bord gauche du popup = point.x (plus de retournement nécessaire, la
    // vraie largeur, bien plus petite, tient très bien à droite du clic).
    expect(popup.bounds.x).toBe(point.x)
  })

  it("l'appel immédiat d'une rafale de redimensionnement ne déclenche PAS la capture — seul l'état final, une fois calmé, la déclenche", async () => {
    vi.resetModules()
    vi.useFakeTimers()
    const owner = makeFakeWindow()
    const popup = makeFakeWindow({ getParentWindow: () => owner })
    electronMock.BrowserWindow = Object.assign(
      vi.fn(function FakeBrowserWindow() {
        return popup
      }),
      { fromWebContents: () => popup }
    ) as never
    setWorkArea({ x: 0, y: 0, width: 1920, height: 1080 })

    const mod = await import('../src/main/popoverWindow')
    const { captureAndSendBackdrop } = await import('../src/main/popoverBackdrop')

    mod.showContextMenuPopover(owner as never, { x: 100, y: 100, width: 0, height: 0 }, [], {})
    // Rafale : plusieurs mesures en succession rapide (sous-menu, transition…).
    mod.resizePopoverWindow(popup.webContents as never, 200, 100)
    mod.resizePopoverWindow(popup.webContents as never, 210, 100)
    mod.resizePopoverWindow(popup.webContents as never, 220, 100)
    // Aucune capture tant que la rafale n'est pas calmée (anti-rebond dédié,
    // 120ms — remis à zéro à CHAQUE appel, y compris celui, différé de 60ms,
    // de l'anti-rebond des bornes lui-même : la capture n'arrive donc que
    // 60+120ms après le DERNIER appel de cette rafale, jamais avant).
    expect(captureAndSendBackdrop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(captureAndSendBackdrop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(captureAndSendBackdrop).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('boundsForAnchor', () => {
  it('coin haut-gauche : les bornes commencent exactement au point', () => {
    const anchor = topLeftAnchor({ x: 100, y: 200 })
    expect(boundsForAnchor(anchor, { width: 320, height: 160 })).toEqual({ x: 100, y: 200, width: 320, height: 160 })
  })

  it('coin haut-droit : le bord DROIT des bornes tombe exactement sur le point', () => {
    const anchor = { x: 'right' as const, y: 'top' as const, point: { x: 500, y: 200 } }
    const bounds = boundsForAnchor(anchor, { width: 320, height: 160 })
    expect(bounds.x + bounds.width).toBe(500)
    expect(bounds.y).toBe(200)
  })

  it('coin bas-droit : le coin bas-droit des bornes tombe exactement sur le point', () => {
    const anchor = { x: 'right' as const, y: 'bottom' as const, point: { x: 500, y: 400 } }
    const bounds = boundsForAnchor(anchor, { width: 320, height: 160 })
    expect(bounds.x + bounds.width).toBe(500)
    expect(bounds.y + bounds.height).toBe(400)
  })
})
