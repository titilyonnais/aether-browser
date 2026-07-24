/**
 * Synchronise le rectangle d'un élément DOM avec la WebContentsView native
 * correspondante. Une boucle rAF lit getBoundingClientRect (coût négligeable
 * pour 1-2 slots) et n'envoie un IPC que si le rectangle a changé — ce qui
 * garde la vue collée au layout même pendant les animations de panneaux.
 */
import { useLayoutEffect, useRef } from 'react'
import type { PageId } from '@shared/types'

export function useViewBounds(
  pageId: PageId | null,
  enabled: boolean,
  /** Élément dont le rectangle sert de zone de recadrage — voir la Toile
   * (SpatialCanvas.tsx), où une carte peut être partiellement ou totalement
   * hors du viewport pannable/zoomable. Sans ça, la vue continuerait d'être
   * positionnée à son rectangle RÉEL (une WebContentsView compose
   * indépendamment de tout `overflow:hidden` DOM), débordant par-dessus le
   * reste de l'interface. Masquage tout-ou-rien plutôt que recadrage partiel :
   * `setBounds` fixe à la fois la position ET la taille de rendu interne de
   * la page — réduire seulement le rectangle ferait apparaître un contenu
   * réduit/déformé plutôt que réellement rogné. */
  clipToRef?: { current: HTMLElement | null }
) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!pageId || !enabled || !el) return

    let raf = 0
    let last = ''
    const tick = (): void => {
      const r = el.getBoundingClientRect()
      let x = r.x
      let y = r.y
      let width = r.width
      let height = r.height
      let forceSend = false
      if (clipToRef?.current) {
        const c = clipToRef.current.getBoundingClientRect()
        const fullyInside = r.left >= c.left && r.top >= c.top && r.right <= c.right && r.bottom <= c.bottom
        if (!fullyInside) {
          x = 0
          y = 0
          width = 0
          height = 0
          forceSend = true
        }
      }
      const key = `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`
      if (key !== last && (forceSend || (width > 0 && height > 0))) {
        last = key
        window.aether.pages.setBounds(pageId, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height)
        })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      // Rétrécir la vue à 0×0 en quittant : sans ce signal, une vue déjà
      // attachée/visible (ex. retour arrière depuis une vraie page vers
      // `aether://newtab`) reste affichée à ses dernières bornes PAR-DESSUS
      // le composant React qui la remplace (une WebContentsView compose
      // toujours au-dessus du DOM) — `enabled` passant à faux ne fait
      // qu'arrêter les mises à jour, jamais masquer ce qui est déjà affiché.
      window.aether.pages.setBounds(pageId, { x: 0, y: 0, width: 0, height: 0 })
    }
  }, [pageId, enabled, clipToRef])

  return ref
}
