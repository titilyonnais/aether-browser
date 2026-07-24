/**
 * Carte de page sur la toile spatiale.
 * Aperçu JPEG plein cadre, voile dégradé, titre + domaine, actions au survol.
 * Déplaçable (n'importe où sur la carte) et redimensionnable (coin bas-droit),
 * les deltas étant divisés par le zoom caméra pour rester en coordonnées monde.
 */
import { motion } from 'framer-motion'
import { ArrowUpRight, Power, X } from 'lucide-react'
import { memo, useRef } from 'react'
import type { PageId, PageMeta } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { useViewBounds } from '@/hooks/useViewBounds'
import { useT } from '@/i18n/useT'
import { closePage, focusPage } from '@/lib/actions'
import { cn, domainOf, hueFromString, previewUrl } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useUiStore } from '@/stores/ui'

const MIN_W = 160
const MIN_H = 115
const MAX_W = 1440
const MAX_H = 1040
/** Hauteur réservée (coordonnées monde, donc mise à l'échelle avec le zoom
 * caméra comme le reste de la carte) pour la bande d'identité en bas — seule
 * zone du DOM que la vue native N'OCCUPE PAS quand la carte est éveillée
 * (une WebContentsView compose toujours au-dessus du DOM, quel que soit le
 * z-index), donc seule zone où boutons/glisser-déposer restent cliquables
 * une fois la carte réveillée. */
const AWAKE_FOOTER_H = 56

interface PageCardProps {
  page: PageMeta
  index: number
  selected: boolean
  getZoom: () => number
  awake: boolean
  onToggleAwake: (id: PageId) => void
}

export const PageCard = memo(
  function PageCard({ page, index, selected, getZoom, awake, onToggleAwake }: PageCardProps) {
    const t = useT()
    // Ref DOM pour écrire directement le style pendant le geste (voir plus
    // bas) — même patron que la caméra de SpatialCanvas.tsx (`apply()`) :
    // aucune écriture dans le store tant que le geste n'est pas terminé,
    // pour éviter que `SpatialCanvas` (abonné à TOUT `pages`, voir son
    // `usePagesStore((s) => s.pages)`) ne se re-rende à chaque pointermove.
    const cardRef = useRef<HTMLDivElement | null>(null)
    const dragRef = useRef<{
      mode: 'move' | 'resize'
      startX: number
      startY: number
      orig: { x: number; y: number; w: number; h: number }
      moved: boolean
      final: { x: number; y: number; w: number; h: number }
    } | null>(null)

    const beginGesture = (e: React.PointerEvent, mode: 'move' | 'resize'): void => {
      if (e.button !== 0) return
      e.stopPropagation()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...page.canvas },
        moved: false,
        final: { ...page.canvas }
      }
    }

    const onPointerMove = (e: React.PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const zoom = getZoom()
      const dx = (e.clientX - drag.startX) / zoom
      const dy = (e.clientY - drag.startY) / zoom
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return
      drag.moved = true
      const el = cardRef.current
      if (drag.mode === 'move') {
        drag.final = { ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy }
        if (el) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      } else {
        const w = Math.min(MAX_W, Math.max(MIN_W, drag.orig.w + dx))
        const h = Math.min(MAX_H, Math.max(MIN_H, drag.orig.h + dy))
        drag.final = { ...drag.orig, w, h }
        if (el) {
          el.style.width = `${w}px`
          el.style.height = `${h}px`
        }
      }
    }

    const onPointerUp = (e: React.PointerEvent): void => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      e.stopPropagation()
      // Efface l'écriture imitée dans le MÊME tick que la mise à jour store —
      // sans ça, le prochain rendu React (nouveaux `left`/`top`) s'ajouterait
      // au `translate3d` encore présent et ferait sauter la carte d'un cran.
      if (cardRef.current) cardRef.current.style.transform = ''
      if (drag.moved) {
        usePagesStore.getState().updateCanvasLocal(page.id, drag.final)
        window.aether.pages.updateCanvas(page.id, drag.final)
      } else if (drag.mode === 'move') {
        useUiStore.getState().select(page.id)
      }
    }

    const preview = previewUrl(page.id, page.previewVersion)
    const domain = domainOf(page.url)
    const hue = hueFromString(domain)
    // Même patron que PageSlot.tsx (mode Focus) : `getBoundingClientRect()`
    // résout déjà les transforms CSS ancêtres (translate/scale de la Toile),
    // donc ce placeholder continue de rapporter les bonnes coordonnées écran
    // pendant le pan/zoom, sans logique de calcul de bornes supplémentaire.
    const boundsRef = useViewBounds(page.id, awake)

    return (
      <motion.div
        ref={cardRef}
        data-card
        initial={{ opacity: 0, scale: 0.965 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32, delay: Math.min(index * 0.025, 0.25) }}
        onPointerDown={(e) => beginGesture(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          focusPage(page.id)
        }}
        className={cn(
          'group absolute overflow-hidden rounded-2xl border bg-mist transition-[border-color,box-shadow] duration-300',
          selected
            ? 'border-glacier/40 shadow-[0_0_0_1px_rgba(169,201,236,0.16),0_28px_90px_-28px_rgba(0,0,0,0.9)]'
            : 'border-white/[0.08] shadow-[0_18px_70px_-24px_rgba(0,0,0,0.85)] hover:border-white/[0.17]'
        )}
        style={{
          left: page.canvas.x,
          top: page.canvas.y,
          width: page.canvas.w,
          height: page.canvas.h
        }}
      >
        {/* Aperçu statique, ou placeholder de bornes pour la vue native une fois éveillée */}
        {!awake &&
          (preview ? (
            <img
              src={preview}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
              alt=""
            />
          ) : (
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center"
              style={{
                background: `linear-gradient(155deg, hsl(${hue} 26% 13%) 0%, hsl(${hue} 20% 7%) 100%)`
              }}
            >
              <div className="flex flex-col items-center gap-3 pb-6">
                <Favicon url={page.url} faviconUrl={page.faviconUrl} size={30} />
                <span className="font-mono text-[11px] text-ink-faint">{domain}</span>
              </div>
            </div>
          ))}
        {awake && (
          <div
            ref={boundsRef}
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ bottom: AWAKE_FOOTER_H }}
          />
        )}

        {/* Barre de chargement */}
        {page.isLoading && (
          <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
            <div
              className="h-full w-1/3 animate-shimmer"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(169,201,236,0.9), transparent)'
              }}
            />
          </div>
        )}

        {/* Voile bas + identité — devient interactive en permanence une fois
            éveillée (les actions au survol du haut sont alors recouvertes
            par la vue native). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex items-center gap-2.5 p-3.5',
            !awake && 'pointer-events-none'
          )}
        >
          <Favicon url={page.url} faviconUrl={page.faviconUrl} size={15} />
          <div className="pointer-events-none min-w-0 flex-1">
            <p className="fade-truncate text-[12.5px] font-medium leading-tight text-ink">
              {page.title || t('focusCanvas.pageCard.untitled')}
            </p>
            <p className="fade-truncate font-mono text-[10px] leading-tight text-ink-dim/70">{domain}</p>
          </div>
          {page.isLive && !awake && (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse-dot rounded-full bg-glacier"
              title={t('focusCanvas.pageCard.liveIndicator')}
            />
          )}
          {awake && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title={t('focusCanvas.pageCard.sleepCard')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleAwake(page.id)
                }}
                className="grid h-6 w-6 place-items-center rounded-md border border-glacier/40 bg-glacier/20 text-glacier"
              >
                <Power size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                title={t('focusCanvas.pageCard.openFocus')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  focusPage(page.id)
                }}
                className="grid h-6 w-6 place-items-center rounded-md border border-white/[0.12] bg-black/55 text-ink-dim hover:text-ink"
              >
                <ArrowUpRight size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                title={t('focusCanvas.pageCard.closePage')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  void closePage(page.id)
                }}
                className="grid h-6 w-6 place-items-center rounded-md border border-white/[0.12] bg-black/55 text-ink-dim hover:text-red-200"
              >
                <X size={12} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </div>

        {/* Actions au survol */}
        <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            title={t('focusCanvas.pageCard.wakeCard')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleAwake(page.id)
            }}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim backdrop-blur-md transition-colors hover:text-ink"
          >
            <Power size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title={t('focusCanvas.pageCard.openFocus')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              focusPage(page.id)
            }}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim backdrop-blur-md transition-colors hover:text-ink"
          >
            <ArrowUpRight size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title={t('focusCanvas.pageCard.closePage')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void closePage(page.id)
            }}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim backdrop-blur-md transition-colors hover:text-red-200"
          >
            <X size={13} strokeWidth={1.8} />
          </button>
        </div>

        {/* Poignée de redimensionnement */}
        <div
          onPointerDown={(e) => beginGesture(e, 'resize')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          title={t('focusCanvas.pageCard.resize')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" className="text-ink-faint">
            <path d="M15 9v6H9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </motion.div>
    )
  },
  (prev, next) =>
    prev.page === next.page &&
    prev.selected === next.selected &&
    prev.index === next.index &&
    prev.awake === next.awake
)
