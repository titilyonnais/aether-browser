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
   * reste de l'interface. On envoie l'INTERSECTION avec cette zone plutôt
   * que de tout masquer dès que ça déborde un peu (`setBounds` fixe aussi la
   * taille de rendu interne de la page, donc le contenu apparaît compressé
   * proportionnellement pendant un débordement — un défaut mineur, largement
   * préférable à un rectangle noir géant le temps de dézoomer). Seule une
   * carte ENTIÈREMENT hors champ (aucun recouvrement du tout) est masquée. */
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
        const ix = Math.max(r.left, c.left)
        const iy = Math.max(r.top, c.top)
        const iw = Math.min(r.right, c.right) - ix
        const ih = Math.min(r.bottom, c.bottom) - iy
        if (iw <= 0 || ih <= 0) {
          x = 0
          y = 0
          width = 0
          height = 0
        } else {
          x = ix
          y = iy
          width = iw
          height = ih
        }
        forceSend = true
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
