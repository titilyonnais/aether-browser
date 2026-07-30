/**
 * Tests du calcul de voile de lisibilité (`computeReadableScrim`) — vérifie
 * que le seuil WCAG AA (4.5:1) est RÉELLEMENT atteint quelle que soit
 * l'image, y compris les cas qui piégeaient l'approche précédente par
 * moyenne de luminance (sujet sombre devant un fond clair).
 *
 * `canvas`/`Image` ne sont pas fournis par l'environnement Node : on les
 * remplace par un faux qui renvoie les pixels décidés par le test, ce qui
 * permet de cibler exactement les distributions de luminance intéressantes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Pixels servis par le faux canvas au prochain appel analysé. */
let pixels: Uint8ClampedArray = new Uint8ClampedArray()

/** Construit une image RVBA à partir de niveaux de gris 0-255. */
function grayImage(levels: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(levels.length * 4)
  levels.forEach((level, i) => {
    data[i * 4] = level
    data[i * 4 + 1] = level
    data[i * 4 + 2] = level
    data[i * 4 + 3] = 255
  })
  return data
}

beforeEach(() => {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        // Chargement immédiat — `computeReadableScrim` attend `onload`.
        setTimeout(() => this.onload?.(), 0)
      }
    }
  )
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: pixels })
      })
    })
  })
})

const { computeReadableScrim } = await import('../src/renderer/src/lib/dominantColor')

/** Rejoue le contraste effectif obtenu après application du voile, avec la
 * MÊME formule que celle du compositeur CSS (mélange en sRGB) — vérifie donc
 * le résultat visible, pas l'implémentation. */
function contrastAfterScrim(level: number, scrim: number): number {
  const lin = (c8: number): number => {
    const c = c8 / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminance = (c8: number): number => 0.2126 * lin(c8) + 0.7152 * lin(c8) + 0.0722 * lin(c8)
  const ink = 0.2126 * lin(0xe9) + 0.7152 * lin(0xe9) + 0.0722 * lin(0xf2)
  const bg = luminance(level * (1 - scrim))
  const [hi, lo] = ink >= bg ? [ink, bg] : [bg, ink]
  return (hi + 0.05) / (lo + 0.05)
}

describe('opacité du texte', () => {
  /** Contraste d'un texte d'opacité `alpha` sur un fond de niveau `bg`. Un
   * texte semi-transparent se MÉLANGE à son fond : c'est ce mélange, et non la
   * couleur nominale, qui décide de la lisibilité. */
  function contrastWithAlpha(textLevel: number, alpha: number, bg: number): number {
    const lin = (c8: number): number => {
      const c = c8 / 255
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    const lum = (c8: number): number => 0.2126 * lin(c8) + 0.7152 * lin(c8) + 0.0722 * lin(c8)
    const rendered = alpha * textLevel + (1 - alpha) * bg
    const [hi, lo] = lum(rendered) >= lum(bg) ? [lum(rendered), lum(bg)] : [lum(bg), lum(rendered)]
    return (hi + 0.05) / (lo + 0.05)
  }

  const FAINT = 0xcf // ON_BACKGROUND_TEXT.faint

  it('un texte à 50 % ne peut PAS atteindre le seuil, même sur du noir pur', () => {
    // Justifie la neutralisation des opacités partielles (`[data-on-theme]`,
    // global.css) : c'était la cause réelle des textes illisibles sur une
    // photo, et AUCUNE force de voile n'aurait pu la corriger.
    expect(contrastWithAlpha(FAINT, 0.5, 0)).toBeLessThan(4.5)
  })

  it('le même texte à pleine opacité passe largement', () => {
    expect(contrastWithAlpha(FAINT, 1, 0)).toBeGreaterThanOrEqual(4.5)
    // Et jusqu'à la limite haute que le voile garantit (luminance ≈ 0.10).
    expect(contrastWithAlpha(FAINT, 1, 88)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('computeReadableScrim', () => {
  it('atteint le seuil AA sur une image uniformément claire', async () => {
    pixels = grayImage(Array(64).fill(235))
    const scrim = await computeReadableScrim('data:,')
    expect(contrastAfterScrim(235, scrim)).toBeGreaterThanOrEqual(4.5)
  })

  it('assombrit à peine une image déjà très sombre', async () => {
    pixels = grayImage(Array(64).fill(12))
    const scrim = await computeReadableScrim('data:,')
    // Déjà lisible sans aide : le voile doit rester quasi nul pour ne pas
    // effacer inutilement l'image choisie.
    expect(scrim).toBeLessThan(0.1)
    expect(contrastAfterScrim(12, scrim)).toBeGreaterThanOrEqual(4.5)
  })

  it('se règle sur les ZONES CLAIRES, pas sur la moyenne', async () => {
    // Le piège exact de l'approche précédente : 70 % de pixels très sombres
    // (une voiture noire) et 30 % de pixels clairs (le ciel derrière). La
    // moyenne reste basse et laissait un voile beaucoup trop léger, alors que
    // le texte posé sur le ciel était illisible.
    pixels = grayImage([...Array(45).fill(18), ...Array(19).fill(225)])
    const scrim = await computeReadableScrim('data:,')
    expect(contrastAfterScrim(225, scrim)).toBeGreaterThanOrEqual(4.5)
  })

  it('ne se laisse pas dicter la loi par un reflet spéculaire isolé', async () => {
    // Un unique pixel blanc pur au milieu d'une image sombre ne doit pas
    // imposer un voile quasi opaque (d'où le centile plutôt que le maximum).
    pixels = grayImage([...Array(63).fill(20), 255])
    const scrim = await computeReadableScrim('data:,')
    expect(scrim).toBeLessThan(0.35)
  })

  it('reste prudent si l’image est inanalysable', async () => {
    pixels = new Uint8ClampedArray()
    expect(await computeReadableScrim('data:,')).toBeGreaterThanOrEqual(0.5)
  })
})
