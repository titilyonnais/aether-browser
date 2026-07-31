/**
 * Capture du fond réel derrière un popup natif (source du flou de chaque
 * carte — voir popoverBackdropLayout.ts côté renderer). Vérifie surtout la
 * garantie centrale du correctif 0.76.1 : un popup qui déborde même très
 * légèrement de sa fenêtre propriétaire (cas systématique — marge
 * anti-rognage de 8px sur CHAQUE popup) doit quand même produire une capture
 * RECADRÉE, jamais un rejet en bloc — un simple rejet laissait chaque bulle
 * sans le moindre flou, silencieusement.
 */
import { describe, expect, it, vi } from 'vitest'
import { captureAndSendBackdrop, computeBackdropCaptureRect } from '../src/main/popoverBackdrop'

function fakeOwner(contentBounds: { x: number; y: number; width: number; height: number }) {
  return {
    isDestroyed: () => false,
    getContentBounds: () => contentBounds,
    webContents: { capturePage: vi.fn() }
  }
}

function fakePopup() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

describe('computeBackdropCaptureRect', () => {
  it('convertit les bornes écran du popup en coordonnées relatives au contenu de la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 100, y: 50, width: 1200, height: 800 })
    const capture = computeBackdropCaptureRect(owner as never, { x: 150, y: 90, width: 320, height: 400 })
    expect(capture).toEqual({ rect: { x: 50, y: 40, width: 320, height: 400 }, offsetX: 0, offsetY: 0 })
  })

  it('RECADRE (jamais ne rejette) un popup qui déborde à gauche/en haut de la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 100, y: 50, width: 1200, height: 800 })
    // Débord de 20px à gauche (x écran 130 < x contenu owner 100+50=150... ici
    // anchorScreenX=130 → local = 130-100 = 30, mais width=320 déborderait à
    // gauche si local était négatif ; on force un cas réellement négatif :
    const capture = computeBackdropCaptureRect(owner as never, { x: 80, y: 90, width: 320, height: 400 })
    // local x = 80-100 = -20 → recadré à 0, largeur réduite d'autant, offsetX=20
    expect(capture).toEqual({ rect: { x: 0, y: 40, width: 300, height: 400 }, offsetX: 20, offsetY: 0 })
  })

  it('RECADRE un popup qui déborde à droite/en bas de la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 900, height: 600 })
    const capture = computeBackdropCaptureRect(owner as never, { x: 700, y: 0, width: 320, height: 100 })
    // right = 700+320=1020, clampé à 900 → largeur 200, offsetX reste 0 (recadré à DROITE, pas à gauche)
    expect(capture).toEqual({ rect: { x: 700, y: 0, width: 200, height: 100 }, offsetX: 0, offsetY: 0 })
  })

  it("cas réel systématique : marge anti-rognage de 8px (SAFETY_PX) sur un popup ancré près du bord droit", () => {
    // Fenêtre 1480×920, bouton proche du bord droit (x local ~1440), popup
    // pinned-right dont la largeur inclut +8px de marge invisible.
    const owner = fakeOwner({ x: 0, y: 0, width: 1480, height: 920 })
    const capture = computeBackdropCaptureRect(owner as never, { x: 1160, y: 60, width: 328, height: 280 })
    // right = 1160+328 = 1488 > 1480 → recadré à 1480, largeur 320 (au lieu de 328)
    expect(capture?.rect).toEqual({ x: 1160, y: 60, width: 320, height: 280 })
    // Pas un rejet : une capture (légèrement plus étroite) part quand même.
    expect(capture).not.toBeNull()
  })

  it('ne renvoie null QUE si le popup ne recouvre plus DU TOUT la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 400, height: 300 })
    expect(computeBackdropCaptureRect(owner as never, { x: 500, y: 0, width: 320, height: 100 })).toBeNull()
    expect(computeBackdropCaptureRect(owner as never, { x: 0, y: 400, width: 100, height: 200 })).toBeNull()
  })
})

describe('captureAndSendBackdrop', () => {
  it('capture puis envoie {dataUrl, width, height, offsetX, offsetY} EN DIP (pas les pixels physiques du bitmap)', async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 1000, height: 800 })
    const image = { toDataURL: () => 'data:image/png;base64,AAA' }
    vi.mocked(owner.webContents.capturePage).mockResolvedValue(image as never)
    const popup = fakePopup()

    await captureAndSendBackdrop(owner as never, popup as never, { x: 10, y: 10, width: 300, height: 200 }, 'test:channel')

    expect(owner.webContents.capturePage).toHaveBeenCalledWith({ x: 10, y: 10, width: 300, height: 200 })
    expect(popup.webContents.send).toHaveBeenCalledWith('test:channel', {
      dataUrl: 'data:image/png;base64,AAA',
      width: 300,
      height: 200,
      offsetX: 0,
      offsetY: 0
    })
  })

  it('capture la version RECADRÉE (pas les bornes demandées) quand le popup déborde', async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 400, height: 300 })
    const image = { toDataURL: () => 'data:image/png;base64,BBB' }
    vi.mocked(owner.webContents.capturePage).mockResolvedValue(image as never)
    const popup = fakePopup()

    await captureAndSendBackdrop(owner as never, popup as never, { x: 300, y: 0, width: 200, height: 100 }, 'test:channel')

    expect(owner.webContents.capturePage).toHaveBeenCalledWith({ x: 300, y: 0, width: 100, height: 100 })
    expect(popup.webContents.send).toHaveBeenCalledWith(
      'test:channel',
      expect.objectContaining({ width: 100, height: 100 })
    )
  })

  it("n'envoie rien quand le popup ne recouvre plus DU TOUT la fenêtre propriétaire", async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 400, height: 300 })
    const popup = fakePopup()

    await captureAndSendBackdrop(owner as never, popup as never, { x: 500, y: 0, width: 300, height: 200 }, 'test:channel')

    expect(owner.webContents.capturePage).not.toHaveBeenCalled()
    expect(popup.webContents.send).not.toHaveBeenCalled()
  })

  it("n'envoie rien si la capture échoue — jamais de flou plutôt qu'un crash", async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 1000, height: 800 })
    vi.mocked(owner.webContents.capturePage).mockRejectedValue(new Error('GPU indisponible'))
    const popup = fakePopup()

    await expect(
      captureAndSendBackdrop(owner as never, popup as never, { x: 0, y: 0, width: 100, height: 100 }, 'test:channel')
    ).resolves.toBeUndefined()
    expect(popup.webContents.send).not.toHaveBeenCalled()
  })

  it('ignore silencieusement une fenêtre déjà détruite (propriétaire ou popup)', async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 1000, height: 800 })
    const popup = { ...fakePopup(), isDestroyed: () => true }

    await captureAndSendBackdrop(owner as never, popup as never, { x: 0, y: 0, width: 100, height: 100 }, 'test:channel')
    expect(owner.webContents.capturePage).not.toHaveBeenCalled()
  })
})
