/**
 * Bande de pages — la traduction ÆTHER-native des onglets : une rangée de
 * vignettes des pages de l'espace courant, cliquable pour charger en Focus.
 * Survol : aperçu (optionnel) + mémoire utilisée, dans une fenêtre popup
 * native flottante (voir src/main/popoverWindow.ts — une page vivante
 * compose toujours au-dessus du DOM, un overlay HTML y serait invisible).
 * Clic milieu : ferme. Clic prolongé + glisser : réordonne. Clic droit :
 * menu contextuel natif complet. Optionnelle (Apparence › Bande de pages).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageId } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { closePage, focusPage, openUrl, reorderPages, toggleMute } from '@/lib/actions'
import { cn, domainOf } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'

/** Distance (px) avant qu'un appui prolongé ne devienne un glisser. */
const DRAG_THRESHOLD = 6
/** Délai avant d'afficher l'aperçu au survol — évite le clignotement pendant un survol rapide. */
const TOOLTIP_DELAY = 1400
/** Un seul `tween` bref, réutilisé PAR TOUS les onglets + le bouton + à la
 * fermeture/ouverture d'un onglet — même durée exacte partout, pour que tout
 * le bloc arrive à destination au même instant (perçu comme un bloc rigide
 * qui coulisse sur un rail, pas des éléments qui glissent indépendamment).
 * 200ms + courbe « standard » Material — la durée par défaut documentée du
 * `BoundsAnimator` de la bande d'onglets de Chromium (`tab_strip.cc`). */
const TAB_SHIFT_TRANSITION = { type: 'tween', duration: 0.2, ease: [0.4, 0, 0.2, 1] } as const

export function PageStrip() {
  const t = useT()
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const newTabUrl = useSettingsStore((s) => s.settings?.newTabUrl ?? '')
  const pagesMap = usePagesStore((s) => s.pages)
  const focus = usePagesStore((s) => (spaceId ? (s.focusBySpace[spaceId] ?? null) : null))
  const [hovered, setHovered] = useState<PageId | null>(null)
  const [tooltipId, setTooltipId] = useState<PageId | null>(null)
  const [order, setOrder] = useState<PageId[]>([])
  const [dragId, setDragId] = useState<PageId | null>(null)
  const [dragOverId, setDragOverId] = useState<PageId | null>(null)

  const tabRefs = useRef(new Map<PageId, HTMLButtonElement>())
  const drag = useRef<{
    id: PageId
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mémoïsé : sans ça, ce tri recalcule à chaque survol/glisser (hovered,
  // tooltipId, dragId... changent bien plus souvent que pagesMap/spaceId).
  const pages = useMemo(
    () =>
      Object.values(pagesMap)
        .filter((p) => p.spaceId === spaceId)
        .sort((a, b) => a.position - b.position),
    [pagesMap, spaceId]
  )

  // Réagence toujours immédiatement (le lissage lui-même vient de `layout`/
  // `AnimatePresence mode="popLayout"` plus bas, pas d'attente ici) — une
  // version précédente retenait la place d'un onglet fermé tant que la souris
  // restait sur la bande (façon Chrome) ; retiré sur retour utilisateur, ça
  // se lisait comme un blocage plutôt que comme un vrai comportement voulu.
  useEffect(() => {
    setOrder(pages.map((p) => p.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, pages.map((p) => p.id).join(',')])

  // Affiche l'aperçu après un court délai (évite le clignotement pendant un survol rapide).
  useEffect(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    if (!hovered || dragId) {
      setTooltipId(null)
      return
    }
    tooltipTimer.current = setTimeout(() => setTooltipId(hovered), TOOLTIP_DELAY)
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    }
  }, [hovered, dragId])

  // Ouvre/ferme le popup natif flottant en fonction de l'onglet survolé.
  useEffect(() => {
    if (!tooltipId) {
      window.aether.popover.hide()
      return
    }
    const el = tabRefs.current.get(tooltipId)
    if (!el) return
    const r = el.getBoundingClientRect()
    window.aether.popover.show({
      kind: 'tab-preview',
      pageId: tooltipId,
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      placement: 'below-center'
    })
  }, [tooltipId])

  // Referme le popup si ce composant se démonte pendant qu'il est ouvert
  // (masquage de la bande de pages, changement de mode…).
  useEffect(() => {
    return () => {
      if (tooltipId) window.aether.popover.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Le main a fermé le popup de son propre chef (clic dans une page).
  useEffect(
    () =>
      window.aether.popover.onClosed(() => {
        setTooltipId(null)
        setHovered(null)
      }),
    []
  )

  // Fermer un onglet (clic milieu, croix) pendant que sa bulle d'aperçu est
  // affichée ne déclenche ni `onPageFocused` ni un survol d'une autre page —
  // rien ne referme sinon le popup natif, qui resterait figé à l'écran.
  function closeAndDismissTooltip(id: PageId): void {
    if (hovered === id) setHovered(null)
    if (tooltipId === id) setTooltipId(null)
    void closePage(id)
  }

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      d.active = true
      setDragId(d.id)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const tab = el?.closest<HTMLElement>('[data-page-id]')
      const overId = tab?.dataset.pageId as PageId | undefined
      if (overId && overId !== d.id) {
        setDragOverId(overId)
        setOrder((prev) => {
          const from = prev.indexOf(d.id)
          const to = prev.indexOf(overId)
          if (from === -1 || to === -1 || from === to) return prev
          const next = [...prev]
          next.splice(from, 1)
          next.splice(to, 0, d.id)
          return next
        })
      }
    }
    function onUp(): void {
      const d = drag.current
      if (d?.active && spaceId) void reorderPages(spaceId, order)
      // Laisse le gestionnaire onClick voir `active` avant de le réinitialiser
      // (le clic suit le pointerup) pour ne pas focaliser l'onglet déposé.
      setTimeout(() => {
        drag.current = null
      }, 0)
      setDragId(null)
      setDragOverId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, spaceId])

  if (pages.length === 0) return null
  const activeSlots = new Set(focus?.slots ?? [])

  const byId = new Map(pages.map((p) => [p.id, p]))
  const orderedIds = order.filter((id) => byId.has(id))

  return (
    <div className="relative flex h-9 shrink-0 items-center gap-1 border-b hairline px-2">
      {/* `overflow-x-auto` sur ce seul conteneur (pas le parent) : la bande défile
          horizontalement sans influer sur quoi que ce soit au-dessus/en dessous.
          `overflow-y-hidden` explicite : `overflow-x` non-`visible` impose sinon
          `overflow-y: auto` par défaut (CSS2.1), ce qui peut faire apparaître un
          scroll vertical parasite dès qu'un enfant déborde ne serait-ce que d'1px. */}
      {/* `relative` est requis ici (pas juste sur un ancêtre plus haut) : c'est
          contre CE conteneur — l'ancêtre direct d'`AnimatePresence` — que
          `mode="popLayout"` positionne l'onglet sortant en `position:absolute`
          pendant sa sortie (doc Framer Motion) ; sans lui (`position:static`
          par défaut), ses coordonnées se calculent contre le mauvais ancêtre
          (la rangée externe, pas cette zone défilante), d'où un blocage/saut
          visible au lieu d'un glissement immédiat des voisins. */}
      <div className="scrollbar-none relative flex h-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden">
        {/* `mode="popLayout"` : SANS lui, `AnimatePresence` garde l'onglet en
            cours de sortie dans le flux normal pendant TOUTE sa durée de
            sortie — ses voisins (dont le bouton + après la liste) ne
            peuvent alors PAS glisser dans l'espace libéré tant qu'il n'est
            pas complètement démonté, d'où un blocage figé suivi d'un
            réagencement brutal. `popLayout` sort l'élément du flux (position
            absolute) DÈS le début de sa sortie, laissant les autres glisser
            immédiatement en douceur pendant qu'il s'estompe par-dessus. */}
        <AnimatePresence initial={false} mode="popLayout">
        {orderedIds.map((id) => {
        const page = byId.get(id)
        if (!page) return null
        const active = activeSlots.has(id)
        const dragging = dragId === id
        return (
          <motion.button
            key={id}
            layout="position"
            // Un `tween` bref et identique partout (glissement, sortie,
            // entrée) plutôt qu'un ressort : un ressort a un léger rebond qui
            // fait paraître chaque onglet indépendant les uns des autres —
            // même durée exacte sur les 3 = tout arrive à destination au même
            // instant, perçu comme un seul bloc rigide qui coulisse.
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={TAB_SHIFT_TRANSITION}
            ref={(el) => {
              if (el) tabRefs.current.set(id, el)
              else tabRefs.current.delete(id)
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={page.title || domainOf(page.url)}
            data-page-id={id}
            onClick={() => {
              if (drag.current?.active) return
              focusPage(id)
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeAndDismissTooltip(id)
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault()
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              window.aether.pages.showContextMenu(id, { x: e.clientX, y: e.clientY, width: 0, height: 0 })
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              drag.current = { id, startX: e.clientX, startY: e.clientY, active: false }
            }}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
            className={cn(
              // `shrink` (pas `flex-1`) : les onglets rétrécissent ensemble quand
              // ils sont nombreux, mais ne s'étirent JAMAIS pour combler l'espace
              // libre — sinon, avec peu d'onglets, ils s'élargissent et poussent
              // le bouton + loin à droite au lieu de rester collé à leur suite.
              'group flex h-7 w-44 min-w-11 shrink items-center gap-1.5 overflow-hidden rounded-md px-2 text-[11px] transition-colors',
              active ? 'bg-white/[0.07] text-ink' : 'text-ink-faint hover:bg-white/[0.04] hover:text-ink-dim',
              dragging && 'opacity-60 ring-1 ring-accent/50',
              dragOverId === id && !dragging && 'ring-1 ring-accent/30'
            )}
          >
            <Favicon url={page.url} faviconUrl={page.faviconUrl} size={12} />
            <span className="min-w-0 flex-1 fade-truncate">{page.title || domainOf(page.url)}</span>
            {page.muted && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  void toggleMute(id)
                }}
                className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded text-ink-faint hover:bg-white/[0.12]"
              >
                <VolumeX size={9} strokeWidth={2} />
              </span>
            )}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                closeAndDismissTooltip(id)
              }}
              className="ml-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:bg-white/[0.12] group-hover:opacity-100"
            >
              <X size={9} strokeWidth={2} />
            </span>
          </motion.button>
        )
        })}
        </AnimatePresence>
      </div>
      {/* Hors de la zone défilante : toujours visible, jamais poussé hors champ
          même quand la bande d'onglets est pleine. `layout="position"` : sans
          ça, ce bouton (pas de `layout` = hors du groupe animé) sautait
          instantanément à sa nouvelle place dès qu'un onglet fermé rétrécissait
          la rangée, pendant que les onglets restants glissaient en douceur —
          désormais tout le bloc (onglets restants + bouton) coulisse ensemble. */}
      <motion.button
        layout="position"
        transition={TAB_SHIFT_TRANSITION}
        type="button"
        title={t('focusCanvas.pageStrip.newTab')}
        aria-label={t('focusCanvas.pageStrip.newTab')}
        onClick={() => void openUrl(newTabUrl.trim() || 'aether://newtab')}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
      >
        <Plus size={13} strokeWidth={1.8} />
      </motion.button>
    </div>
  )
}
