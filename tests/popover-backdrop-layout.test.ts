/**
 * Géométrie pure du calque flouté des bulles — vérifie surtout ce qui compte
 * pour ne JAMAIS déborder de la carte : le calque reste toujours en `inset`
 * négatif fixe (déborde AVANT découpe par `overflow-hidden`, jamais après),
 * et l'alignement de l'image capturée compense À LA FOIS le décalage de la
 * carte dans la fenêtre popup (menu principal avec marge de flyout réservée
 * à gauche) ET le décalage introduit par un éventuel recadrage de la capture
 * elle-même (popoverBackdrop.ts, main — popup débordant de sa fenêtre
 * propriétaire).
 */
import { describe, expect, it } from 'vitest'
import {
  computePopoverBackdropLayers,
  POPOVER_BACKDROP_OVERSCAN_PX
} from '../src/renderer/src/lib/popoverBackdropLayout'

const NO_CROP = { offsetX: 0, offsetY: 0 }

describe('computePopoverBackdropLayers', () => {
  it('carte alignée sur le coin de la fenêtre popup, capture non recadrée (cas le plus courant)', () => {
    const layers = computePopoverBackdropLayers({ left: 0, top: 0 }, { width: 320, height: 400, ...NO_CROP })
    expect(layers.inset).toBe(-POPOVER_BACKDROP_OVERSCAN_PX)
    // Sans décalage de carte ni recadrage, l'image ne doit être compensée QUE
    // par le débordement volontaire du calque (overscan) — jamais par autre chose.
    expect(layers.backgroundPosition).toBe(`0 0, ${POPOVER_BACKDROP_OVERSCAN_PX}px ${POPOVER_BACKDROP_OVERSCAN_PX}px`)
    expect(layers.backgroundSize).toBe('100% 100%, 320px 400px')
  })

  it('compense le décalage de la carte dans la fenêtre (menu principal avec marge de flyout à gauche)', () => {
    // Cas réel : AppMenuPopoverCard.tsx pousse sa carte visible à droite
    // (`ml-auto`) dans une fenêtre plus large qui réserve de la place à
    // gauche pour un flyout fermé — la carte ne commence donc PAS à x=0.
    const layers = computePopoverBackdropLayers({ left: 240, top: 0 }, { width: 560, height: 320, ...NO_CROP })
    const [, photoPos] = layers.backgroundPosition.split(', ')
    expect(photoPos).toBe(`${POPOVER_BACKDROP_OVERSCAN_PX - 240}px ${POPOVER_BACKDROP_OVERSCAN_PX}px`)
  })

  it('compense EN PLUS le décalage introduit par un recadrage de la capture (popup débordant de sa fenêtre)', () => {
    // Cas réel systématique (marge anti-rognage de 8px sur CHAQUE popup) :
    // popoverBackdrop.ts a dû recadrer depuis la gauche/le haut — l'image ne
    // commence donc plus au coin du popup, mais `offsetX`/`offsetY` pixels
    // plus loin. Sans cette compensation, l'image capturée « glisse » par
    // rapport à la carte dès qu'un recadrage a eu lieu.
    const layers = computePopoverBackdropLayers({ left: 0, top: 0 }, { width: 300, height: 400, offsetX: 20, offsetY: 5 })
    const [, photoPos] = layers.backgroundPosition.split(', ')
    expect(photoPos).toBe(`${POPOVER_BACKDROP_OVERSCAN_PX + 20}px ${POPOVER_BACKDROP_OVERSCAN_PX + 5}px`)
  })

  it("le calque déborde TOUJOURS de la carte d'un montant fixe, quelle que soit sa position", () => {
    // C'est ce `inset` négatif + le `overflow-hidden` du parent (global.css)
    // qui garantissent que le flou ne peut jamais déborder VISIBLEMENT de sa
    // bulle — le calque lui-même s'étend au-delà, mais toujours strictement
    // À L'INTÉRIEUR de ce que le parent choisit de laisser passer.
    for (const offset of [{ left: 0, top: 0 }, { left: 500, top: 120 }, { left: -30, top: 8 }]) {
      const layers = computePopoverBackdropLayers(offset, { width: 100, height: 100, ...NO_CROP })
      expect(layers.inset).toBe(-POPOVER_BACKDROP_OVERSCAN_PX)
    }
  })

  it("deux calques d'arrière-plan (teinte puis photo), jamais un seul", () => {
    // `background-color` peint TOUJOURS sous `background-image` sur un même
    // élément — impossible d'obtenir une teinte PAR-DESSUS le flou avec une
    // seule déclaration. Une LISTE de deux `background-image` (dégradé uni +
    // photo), elle, respecte l'ordre indiqué : deux valeurs virgule-séparées
    // ici, jamais une seule.
    const layers = computePopoverBackdropLayers({ left: 0, top: 0 }, { width: 200, height: 200, ...NO_CROP })
    expect(layers.backgroundPosition.split(',').length).toBe(2)
    expect(layers.backgroundSize.split(',').length).toBe(2)
  })
})
