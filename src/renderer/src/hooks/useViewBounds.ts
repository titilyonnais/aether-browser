/**
 * Synchronise le rectangle d'un élément DOM avec la WebContentsView native
 * correspondante. Une boucle rAF lit getBoundingClientRect (coût négligeable
 * pour 1-2 slots) et n'envoie un IPC que si le rectangle a changé — ce qui
 * garde la vue collée au layout même pendant les animations de panneaux.
 */
import { useLayoutEffect, useRef } from 'react'
import type { PageId } from '@shared/types'

export function useViewBounds(pageId: PageId | null, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!pageId || !enabled || !el) return

    let raf = 0
    let last = ''
    const tick = (): void => {
      const r = el.getBoundingClientRect()
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`
      if (key !== last && r.width > 0 && r.height > 0) {
        last = key
        window.aether.pages.setBounds(pageId, {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height)
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
  }, [pageId, enabled])

  return ref
}
