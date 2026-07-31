/**
 * Injecte le calque flouté dans CHAQUE carte `.popover-surface` visible sous
 * `containerRef` — partagé entre PopoverRoot.tsx et PermissionPromptRoot.tsx
 * (même mécanisme, deux fenêtres popup natives distinctes). Voir global.css
 * (`.popover-surface`) et popoverBackdropLayout.ts pour le détail de
 * pourquoi cette approche (capture d'écran + calque CSS local à CHAQUE
 * carte) plutôt qu'un flou natif Windows ou `backdrop-filter` classique —
 * en résumé : c'est la SEULE des trois qui ne peut structurellement jamais
 * déborder de sa carte (le `overflow-hidden` de `.popover-surface` la
 * découpe, un mécanisme du modèle de boîte du navigateur — pas un choix
 * d'implémentation qu'on pourrait mal régler une seconde fois).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PopoverBackdrop } from '@shared/types'
import { computePopoverBackdropLayers } from '@/lib/popoverBackdropLayout'

const TINT = 'rgba(16, 16, 24, 0.62)'

export function PopoverSurfaceBlur({
  containerRef,
  backdrop
}: {
  containerRef: { current: HTMLElement | null }
  backdrop: PopoverBackdrop | null
}) {
  const [surfaces, setSurfaces] = useState<HTMLElement[]>([])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const rescan = (): void => {
      setSurfaces(Array.from(root.querySelectorAll<HTMLElement>('.popover-surface')))
    }
    rescan()
    // `MutationObserver` plutôt qu'un simple effet React déclenché par les
    // props de CE composant : la carte flyout du menu principal
    // (AppMenuPopoverCard.tsx) gagne/perd la classe `.popover-surface` suite
    // à un état LOCAL à ce composant (ouverture d'un sous-menu) — un
    // changement que ce composant-ci, simple frère du contenu affiché sous
    // le même parent, ne voit JAMAIS autrement : React ne re-rend que le
    // sous-arbre dont l'état a changé, jamais ses frères. Seule une
    // observation directe du DOM capture ce genre de changement, d'où ce
    // composant reste TOUJOURS à jour sur le nombre réel de bulles à
    // flouter, quelle que soit la carte qui vient de (dis)paraître.
    const observer = new MutationObserver(rescan)
    observer.observe(root, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true })
    return () => observer.disconnect()
    // Montage unique par instance : cette instance elle-même est remontée à
    // chaque nouvelle ouverture (voir `key={contentNonce}` côté appelants),
    // donc `containerRef.current` pointe déjà sur le DOM à jour ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!backdrop) return null

  return (
    <>
      {surfaces.map((el, i) => {
        const rect = el.getBoundingClientRect()
        const layers = computePopoverBackdropLayers(rect, backdrop)
        return createPortal(
          <div
            aria-hidden
            className="pointer-events-none absolute -z-10"
            style={{
              inset: layers.inset,
              backgroundImage: `linear-gradient(${TINT}, ${TINT}), url(${backdrop.dataUrl})`,
              backgroundPosition: layers.backgroundPosition,
              backgroundSize: layers.backgroundSize,
              backgroundRepeat: 'no-repeat',
              filter: 'blur(22px)'
            }}
          />,
          el,
          `popover-blur-${i}`
        )
      })}
    </>
  )
}
