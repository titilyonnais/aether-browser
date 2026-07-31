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

/** Rectangle (DIP, relatif au CONTENU de `owner`) à capturer pour servir de
 * fond flouté à un popup positionné à `bounds` (DIP, coordonnées écran) — ou
 * `null` si le popup déborde de la fenêtre propriétaire (bord d'écran,
 * fenêtre non maximisée, popup ancré près d'un coin) : rien de fiable à
 * capturer dans ce cas plutôt qu'une capture partielle mal alignée, la carte
 * garde alors son fond opaque de repli (`.popover-surface`, jamais cassé). */
export function computeBackdropCaptureRect(owner: BW, bounds: Rectangle): Rectangle | null {
  const ownerBounds = owner.getContentBounds()
  const rect = {
    x: Math.round(bounds.x - ownerBounds.x),
    y: Math.round(bounds.y - ownerBounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  }
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > ownerBounds.width ||
    rect.y + rect.height > ownerBounds.height
  ) {
    return null
  }
  return rect
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
  const rect = computeBackdropCaptureRect(owner, bounds)
  if (!rect) return
  try {
    const image = await owner.webContents.capturePage(rect)
    if (popup.isDestroyed()) return
    // `width`/`height` = le rect DIP demandé, PAS `image.getSize()` (pixels
    // physiques du bitmap, qui diffèrent sur un facteur d'échelle Windows non
    // entier) — c'est ce que `background-size` doit recevoir côté renderer
    // pour un alignement pixel-perfect avec `getBoundingClientRect()`.
    popup.webContents.send(channel, { dataUrl: image.toDataURL(), width: rect.width, height: rect.height })
  } catch {
    // Capture indisponible (fenêtre minimisée, GPU occupé…) — sans
    // conséquence bloquante, la carte garde son fond opaque de repli.
  }
}
