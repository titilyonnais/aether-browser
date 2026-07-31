/**
 * Capture du fond réel derrière un popup natif (source du flou de chaque
 * carte — voir popoverBackdropLayout.ts côté renderer). Vérifie surtout le
 * repli SÛR : aucune capture (donc aucun flou, carte opaque de repli) plutôt
 * qu'une capture partielle mal alignée, dès que le popup déborde de sa
 * fenêtre propriétaire.
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
    const rect = computeBackdropCaptureRect(owner as never, { x: 150, y: 90, width: 320, height: 400 })
    expect(rect).toEqual({ x: 50, y: 40, width: 320, height: 400 })
  })

  it('renvoie null quand le popup déborde à gauche/en haut de la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 100, y: 50, width: 1200, height: 800 })
    expect(computeBackdropCaptureRect(owner as never, { x: 50, y: 90, width: 320, height: 400 })).toBeNull()
    expect(computeBackdropCaptureRect(owner as never, { x: 150, y: 20, width: 320, height: 400 })).toBeNull()
  })

  it('renvoie null quand le popup déborde à droite/en bas de la fenêtre propriétaire', () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 900, height: 600 })
    expect(computeBackdropCaptureRect(owner as never, { x: 700, y: 0, width: 320, height: 100 })).toBeNull()
    expect(computeBackdropCaptureRect(owner as never, { x: 0, y: 550, width: 100, height: 200 })).toBeNull()
  })
})

describe('captureAndSendBackdrop', () => {
  it('capture puis envoie {dataUrl, width, height} EN DIP (pas les pixels physiques du bitmap)', async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 1000, height: 800 })
    const image = { toDataURL: () => 'data:image/png;base64,AAA' }
    vi.mocked(owner.webContents.capturePage).mockResolvedValue(image as never)
    const popup = fakePopup()

    await captureAndSendBackdrop(owner as never, popup as never, { x: 10, y: 10, width: 300, height: 200 }, 'test:channel')

    expect(owner.webContents.capturePage).toHaveBeenCalledWith({ x: 10, y: 10, width: 300, height: 200 })
    expect(popup.webContents.send).toHaveBeenCalledWith('test:channel', {
      dataUrl: 'data:image/png;base64,AAA',
      width: 300,
      height: 200
    })
  })

  it("n'envoie rien quand le rectangle déborde de la fenêtre propriétaire", async () => {
    const owner = fakeOwner({ x: 0, y: 0, width: 400, height: 300 })
    const popup = fakePopup()

    await captureAndSendBackdrop(owner as never, popup as never, { x: 350, y: 0, width: 300, height: 200 }, 'test:channel')

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
