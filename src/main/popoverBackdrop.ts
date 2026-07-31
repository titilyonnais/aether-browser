/**
 * Capture de ce qu'il y a RÉELLEMENT derrière une fenêtre popup native — voir
 * PopoverBackdrop (shared/types.ts) pour le format envoyé au renderer, et
 * global.css/`.popover-surface` pour comment il est flouté puis affiché.
 *
 * Pourquoi une capture plutôt qu'un flou natif Windows (essayé puis retiré,
 * voir CHANGELOG 0.74.1) : ces fenêtres sont délibérément un peu plus GRANDES
 * que la carte visible (marge anti-rognage + largeur réservée pour un flyout
 * fermé, voir PopoverRoot.tsx) — le matériau Acrylic de Windows peint sur
 * TOUT le rectangle de la fenêtre sans se soucier de ces zones invisibles
 * côté CSS, débordant largement de la carte. Une capture consommée par un
 * flou CSS (`filter: blur()` sur un calque interne à CHAQUE carte, découpé
 * par son propre `overflow-hidden`) est le SEUL mécanisme qui ne peut
 * structurellement jamais déborder de sa carte : le découpage vient du
 * modèle de boîte du navigateur, pas d'un compositeur externe qui ignore nos
 * marges.
 */
import type { BrowserWindow as BW, Rectangle } from 'electron'

export interface BackdropCapture {
  /** Rectangle RÉELLEMENT capturé (DIP, relatif au contenu de `owner`) —
   * toujours entièrement contenu dans ses bornes, jamais rejeté en bloc. */
  rect: Rectangle
  /** Décalage (DIP) entre le coin haut-gauche VOULU du popup et celui
   * réellement capturé — non nul seulement si `bounds` débordait de `owner`
   * et a dû être recadré depuis la gauche/le haut. */
  offsetX: number
  offsetY: number
}

/** Calcule le rectangle à capturer pour servir de fond flouté à un popup
 * positionné à `bounds` (DIP, coordonnées écran) — RECADRÉ pour tenir
 * entièrement dans la fenêtre propriétaire plutôt que rejeté en bloc au
 * moindre débordement : CHAQUE popup déborde un peu de `owner` par
 * construction (marge anti-rognage de 8px systématique sur son propre
 * contenu, voir PopoverRoot.tsx/`SAFETY_PX`), donc un simple rejet
 * (implémentation précédente) écartait la capture bien plus souvent que
 * prévu — silencieusement, sans qu'aucune bulle n'affiche jamais le
 * moindre flou. `null` seulement si le popup ne recouvre plus DU TOUT
 * `owner` (aucun pixel commun) — cas limite qui ne devrait jamais se
 * produire en pratique, un popup est toujours ancré à un bouton À
 * L'INTÉRIEUR de la fenêtre. */
export function computeBackdropCaptureRect(owner: BW, bounds: Rectangle): BackdropCapture | null {
  const ownerBounds = owner.getContentBounds()
  const desiredX = Math.round(bounds.x - ownerBounds.x)
  const desiredY = Math.round(bounds.y - ownerBounds.y)
  const desiredWidth = Math.round(bounds.width)
  const desiredHeight = Math.round(bounds.height)

  const x = Math.max(0, desiredX)
  const y = Math.max(0, desiredY)
  const right = Math.min(desiredX + desiredWidth, ownerBounds.width)
  const bottom = Math.min(desiredY + desiredHeight, ownerBounds.height)
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null

  return {
    rect: { x, y, width, height },
    offsetX: x - desiredX,
    offsetY: y - desiredY
  }
}

/** Capture ce qu'il y a réellement dans `owner` sous `bounds`, et le pousse à
 * `popup` sur `channel` — TOUJOURS en tâche de fond (jamais attendu avant de
 * révéler le popup, voir les appelants) : la carte reste opaque, sans flou,
 * tant que cette capture n'est pas arrivée — jamais de flou mal aligné ou
 * périmé affiché entre-temps. */
export async function captureAndSendBackdrop(
  owner: BW,
  popup: BW,
  bounds: Rectangle,
  channel: string
): Promise<void> {
  if (owner.isDestroyed() || popup.isDestroyed()) return
  const capture = computeBackdropCaptureRect(owner, bounds)
  if (!capture) return
  try {
    const image = await owner.webContents.capturePage(capture.rect)
    if (popup.isDestroyed()) return
    // `width`/`height` = le rect DIP réellement capturé, PAS `image.getSize()`
    // (pixels physiques du bitmap, qui diffèrent sur un facteur d'échelle
    // Windows non entier) — c'est ce que `background-size` doit recevoir côté
    // renderer pour un alignement pixel-perfect avec `getBoundingClientRect()`.
    popup.webContents.send(channel, {
      dataUrl: image.toDataURL(),
      width: capture.rect.width,
      height: capture.rect.height,
      offsetX: capture.offsetX,
      offsetY: capture.offsetY
    })
  } catch {
    // Capture indisponible (fenêtre minimisée, GPU occupé…) — sans
    // conséquence bloquante, la carte garde son fond opaque de repli.
  }
}
