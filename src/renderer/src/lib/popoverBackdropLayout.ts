/**
 * Géométrie pure du calque flouté injecté dans chaque carte `.popover-surface`
 * (voir PopoverRoot.tsx/PermissionPromptRoot.tsx pour l'injection, global.css
 * pour pourquoi cette approche plutôt qu'un flou natif Windows ou CSS
 * classique). Isolée en fonction pure ici pour rester testable sans DOM.
 */

/** Le calque déborde volontairement de la carte AVANT d'être flouté, sinon
 * `filter: blur()` laisserait un anneau semi-transparent visible pile sur le
 * bord de la carte (même patron que le fond flouté de NewTabPage.tsx) — c'est
 * le `overflow: hidden` de `.popover-surface` (global.css) qui le redécoupe
 * ensuite au pixel près, jamais le calque lui-même. */
export const POPOVER_BACKDROP_OVERSCAN_PX = 12

export interface PopoverBackdropLayers {
  /** À passer tel quel en `inset` (CSS) sur le calque injecté. */
  inset: number
  /** `background-position` pour les DEUX calques (teinte unie, puis photo). */
  backgroundPosition: string
  /** `background-size` pour les DEUX calques. */
  backgroundSize: string
}

/**
 * `cardOffset` : position de LA CARTE (l'élément `.popover-surface` lui-même)
 * dans le repère de la fenêtre popup — exactement ce que rend
 * `getBoundingClientRect()` dans ce contexte (fenêtre popup = tout le
 * viewport, jamais de défilement de page autour), sans conversion
 * supplémentaire.
 * `backdrop` : la capture — `width`/`height` = dimensions RÉELLEMENT capturées
 * (une carte ne remplit pas forcément toute la fenêtre, ex. le menu principal
 * avec sa marge de flyout réservée à gauche) ; `offsetX`/`offsetY` = décalage
 * entre le coin haut-gauche VOULU du popup et celui réellement capturé (non
 * nul si `popoverBackdrop.ts`, main, a dû recadrer — popup débordant de sa
 * fenêtre propriétaire, même de quelques pixels). Sans ce décalage, l'image
 * capturée après un recadrage semblait « glisser » par rapport à la carte —
 * elle représente alors un rectangle qui ne commence PLUS au coin du popup.
 */
export function computePopoverBackdropLayers(
  cardOffset: { left: number; top: number },
  backdrop: { width: number; height: number; offsetX: number; offsetY: number }
): PopoverBackdropLayers {
  const x = POPOVER_BACKDROP_OVERSCAN_PX + backdrop.offsetX - cardOffset.left
  const y = POPOVER_BACKDROP_OVERSCAN_PX + backdrop.offsetY - cardOffset.top
  return {
    inset: -POPOVER_BACKDROP_OVERSCAN_PX,
    // Premier calque (teinte) : une seule couleur unie, sa propre position
    // n'a aucune importance tant qu'elle couvre `100% 100%` — `0 0` sert
    // juste de valeur neutre pour aligner les deux listes CSS terme à terme.
    backgroundPosition: `0 0, ${x}px ${y}px`,
    backgroundSize: `100% 100%, ${backdrop.width}px ${backdrop.height}px`
  }
}
