/**
 * Géométrie pure du calque flouté des bulles — vérifie surtout ce qui compte
 * pour ne JAMAIS déborder de la carte : le calque reste toujours en `inset`
 * négatif fixe (déborde AVANT découpe par `overflow-hidden`, jamais après),
 * et l'alignement de l'image capturée compense exactement le décalage de la
 * carte dans la fenêtre popup (menu principal avec marge de flyout réservée
 * à gauche, où la carte visible ne commence pas à (0,0)).
 */
import { describe, expect, it } from 'vitest'
import {
  computePopoverBackdropLayers,
  POPOVER_BACKDROP_OVERSCAN_PX
} from '../src/renderer/src/lib/popoverBackdropLayout'

describe('computePopoverBackdropLayers', () => {
  it('carte alignée sur le coin de la fenêtre popup (cas le plus courant)', () => {
    const layers = computePopoverBackdropLayers({ left: 0, top: 0 }, { width: 320, height: 400 })
    expect(layers.inset).toBe(-POPOVER_BACKDROP_OVERSCAN_PX)
    // Sans décalage de carte, l'image ne doit être compensée QUE par le
    // débordement volontaire du calque (overscan) — jamais par autre chose.
    expect(layers.backgroundPosition).toBe(`0 0, ${POPOVER_BACKDROP_OVERSCAN_PX}px ${POPOVER_BACKDROP_OVERSCAN_PX}px`)
    expect(layers.backgroundSize).toBe('100% 100%, 320px 400px')
  })

  it('compense le décalage de la carte dans la fenêtre (menu principal avec marge de flyout à gauche)', () => {
    // Cas réel : AppMenuPopoverCard.tsx pousse sa carte visible à droite
    // (`ml-auto`) dans une fenêtre plus large qui réserve de la place à
    // gauche pour un flyout fermé — la carte ne commence donc PAS à x=0.
    const layers = computePopoverBackdropLayers({ left: 240, top: 0 }, { width: 560, height: 320 })
    const [, photoPos] = layers.backgroundPosition.split(', ')
    expect(photoPos).toBe(`${POPOVER_BACKDROP_OVERSCAN_PX - 240}px ${POPOVER_BACKDROP_OVERSCAN_PX}px`)
  })

  it("le calque déborde TOUJOURS de la carte d'un montant fixe, quelle que soit sa position", () => {
    // C'est ce `inset` négatif + le `overflow-hidden` du parent (global.css)
    // qui garantissent que le flou ne peut jamais déborder VISIBLEMENT de sa
    // bulle — le calque lui-même s'étend au-delà, mais toujours strictement
    // À L'INTÉRIEUR de ce que le parent choisit de laisser passer.
    for (const offset of [{ left: 0, top: 0 }, { left: 500, top: 120 }, { left: -30, top: 8 }]) {
      const layers = computePopoverBackdropLayers(offset, { width: 100, height: 100 })
      expect(layers.inset).toBe(-POPOVER_BACKDROP_OVERSCAN_PX)
    }
  })

  it("deux calques d'arrière-plan (teinte puis photo), jamais un seul", () => {
    // `background-color` peint TOUJOURS sous `background-image` sur un même
    // élément — impossible d'obtenir une teinte PAR-DESSUS le flou avec une
    // seule déclaration. Une LISTE de deux `background-image` (dégradé uni +
    // photo), elle, respecte l'ordre indiqué : deux valeurs virgule-séparées
    // ici, jamais une seule.
    const layers = computePopoverBackdropLayers({ left: 0, top: 0 }, { width: 200, height: 200 })
    expect(layers.backgroundPosition.split(',').length).toBe(2)
    expect(layers.backgroundSize.split(',').length).toBe(2)
  })
})
