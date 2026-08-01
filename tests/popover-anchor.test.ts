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
    getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }))
  }
}))
vi.mock('electron', () => electronMock)
vi.mock('../src/main/dwm', () => ({ disableNativeWindowTransitions: vi.fn() }))
vi.mock('../src/main/windowFade', () => ({ fadeWindowIn: vi.fn(), fadeWindowOut: vi.fn() }))
vi.mock('../src/main/popoverBackdrop', () => ({ captureAndSendBackdrop: vi.fn() }))

function setWorkArea(area: { x: number; y: number; width: number; height: number }): void {
  electronMock.screen.getDisplayNearestPoint.mockReturnValue({ workArea: area })
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
