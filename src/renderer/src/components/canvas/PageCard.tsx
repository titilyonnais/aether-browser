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
import { NewTabPage } from '@/components/focus/NewTabPage'
import { Favicon } from '@/components/ui/Favicon'
import { useViewBounds } from '@/hooks/useViewBounds'
import { useT } from '@/i18n/useT'
import { closePage, focusPage } from '@/lib/actions'
import { pageLabel, pageSubtitle } from '@/lib/pageLabel'
import { cn, domainOf, hueFromString, previewUrl } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useUiStore } from '@/stores/ui'

const MIN_W = 160
const MIN_H = 115
const MAX_W = 1440
const MAX_H = 1040
/** Distance de déclenchement de l'aimantation, en pixels ÉCRAN (convertie en
 * unités monde selon le zoom courant). Ni repli grille (donnait une
 * sensation de « suivre un quadrillage », plus du tout fluide) ni repère
 * visuel (non désiré, l'aimantation doit rester discrète). */
const SNAP_THRESHOLD_PX = 10

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Aimante `rect` (déjà déplacé) sur les bords (gauche/droite pour X, haut/
 * bas pour Y) des cartes voisines les plus proches — chaque axe évalué
 * INDÉPENDAMMENT, pas de centre, pas de couplage entre les deux axes.
 *
 * Une première version couplait les deux axes à la paire de COINS la plus
 * proche globalement : dès qu'une paire légèrement plus proche apparaissait
 * (un tout petit mouvement de souris suffisait), la carte sautait d'un coup
 * vers ce nouveau point d'ancrage — perçu comme des « téléportations ». En
 * évaluant x et y séparément, chaque axe ne dépend que de SA propre distance
 * la plus proche, sans jamais être entraîné par un changement sur l'autre
 * axe — nettement plus stable. Ça fonctionne aussi quelle que soit la
 * différence de taille entre les deux cartes (un bord reste un bord, qu'il
 * appartienne à une petite ou une grande carte), contrairement à un
 * aimantage coin à coin strict qui exigeait un vrai coin à proximité. */
function computeSnap(rect: Rect, siblings: Rect[], thresholdWorld: number): { dx: number; dy: number } {
  let bestDx = 0
  let bestDxDist = thresholdWorld
  let bestDy = 0
  let bestDyDist = thresholdWorld

  const xEdges = [rect.x, rect.x + rect.w]
  const yEdges = [rect.y, rect.y + rect.h]

  for (const s of siblings) {
    const sxEdges = [s.x, s.x + s.w]
    const syEdges = [s.y, s.y + s.h]
    for (const xe of xEdges) {
      for (const sxe of sxEdges) {
        const dist = Math.abs(xe - sxe)
        if (dist < bestDxDist) {
          bestDxDist = dist
          bestDx = sxe - xe
        }
      }
    }
    for (const ye of yEdges) {
      for (const sye of syEdges) {
        const dist = Math.abs(ye - sye)
        if (dist < bestDyDist) {
          bestDyDist = dist
          bestDy = sye - ye
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy }
}
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
  /** Conteneur visible de la Toile (SpatialCanvas.tsx) — sert à masquer la
   * vue native tant que la carte n'est pas ENTIÈREMENT dans le viewport
   * pannable/zoomable (voir useViewBounds). */
  viewportRef: { current: HTMLElement | null }
  /** Toutes les pages de l'espace actif (soi-même inclus) — sert à
   * l'aimantation coin à coin sur les autres cartes pendant un glisser. */
  allPages: PageMeta[]
}

export const PageCard = memo(
  function PageCard({ page, index, selected, getZoom, awake, onToggleAwake, viewportRef, allPages }: PageCardProps) {
    const t = useT()
    // `cardRef` = le conteneur EXTÉRIEUR (un `<div>` ORDINAIRE, jamais
    // framer-motion) qui porte position (`left`/`top`), taille (`width`/
    // `height`) ET la transformation de glisser. On écrit directement son
    // style pendant le geste (même patron que la caméra de SpatialCanvas.tsx,
    // `apply()`) : aucune écriture dans le store tant que le geste n'est pas
    // terminé, pour éviter que `SpatialCanvas` (abonné à TOUT `pages`) ne se
    // re-rende à chaque pointermove.
    //
    // CRUCIAL — la transformation de DÉPLACEMENT doit être sur cet élément
    // EXTÉRIEUR (cadre + contenu ensemble), et cet élément ne doit PAS être
    // géré par framer-motion :
    //  - Si on ne déplace qu'un élément INTÉRIEur (contenu seul), le cadre
    //    (bordure/fond/`overflow-hidden`) reste sur place et le contenu
    //    glisse en-dessous en se faisant rogner — cadre vide + contenu
    //    détaché (bug observé).
    //  - Si on écrit `transform` sur le `motion.div` lui-même, framer-motion
    //    réaffirme SA PROPRE valeur de `transform` (pour l'anim de `scale`) à
    //    chaque re-rendu (ex. titre d'une page vivante mis à jour en fond),
    //    écrasant notre position en plein glisser — « téléportations ».
    // D'où : cadre extérieur ordinaire (position/taille/glisser) + `motion.div`
    // INTÉRIEUR isolé à la seule animation d'apparition (opacity/scale).
    const cardRef = useRef<HTMLDivElement | null>(null)
    const dragRef = useRef<{
      mode: 'move' | 'resize'
      startX: number
      startY: number
      orig: { x: number; y: number; w: number; h: number }
      moved: boolean
      final: { x: number; y: number; w: number; h: number }
      /** Rectangles des AUTRES cartes, figés au début du geste — recalculés à
       * chaque pointermove sinon (un `filter`+`map` créant N objets par
       * évènement, jusqu'à ~1000/s sur une souris haute fréquence), ce qui
       * générait assez de déchets pour provoquer des micro-freezes de GC. */
      siblings: Rect[]
    } | null>(null)

    const beginGesture = (e: React.PointerEvent, mode: 'move' | 'resize'): void => {
      if (e.button !== 0) return
      e.stopPropagation()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      // Promeut la carte sur sa propre couche de composition GPU le temps du
      // geste — sans ça, chaque déplacement re-peint une carte lourde (ombres,
      // éventuelle vue vivante), d'où les saccades. Retiré au relâchement pour
      // ne pas garder une couche figée en permanence.
      if (cardRef.current) cardRef.current.style.willChange = 'transform'
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...page.canvas },
        moved: false,
        final: { ...page.canvas },
        siblings: mode === 'move' ? allPages.filter((p) => p.id !== page.id).map((p) => p.canvas) : []
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
      if (drag.mode === 'move') {
        const snap = computeSnap(
          { x: drag.orig.x + dx, y: drag.orig.y + dy, w: drag.orig.w, h: drag.orig.h },
          drag.siblings,
          SNAP_THRESHOLD_PX / zoom
        )
        const finalDx = dx + snap.dx
        const finalDy = dy + snap.dy
        drag.final = { ...drag.orig, x: drag.orig.x + finalDx, y: drag.orig.y + finalDy }
        if (cardRef.current) cardRef.current.style.transform = `translate3d(${finalDx}px, ${finalDy}px, 0)`
      } else {
        const w = Math.min(MAX_W, Math.max(MIN_W, drag.orig.w + dx))
        const h = Math.min(MAX_H, Math.max(MIN_H, drag.orig.h + dy))
        drag.final = { ...drag.orig, w, h }
        if (cardRef.current) {
          cardRef.current.style.width = `${w}px`
          cardRef.current.style.height = `${h}px`
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
      if (cardRef.current) {
        cardRef.current.style.transform = ''
        cardRef.current.style.willChange = 'auto'
      }
      if (drag.moved) {
        usePagesStore.getState().updateCanvasLocal(page.id, drag.final)
        window.aether.pages.updateCanvas(page.id, drag.final)
      } else if (drag.mode === 'move') {
        useUiStore.getState().select(page.id)
      }
    }

    const preview = previewUrl(page.id, page.previewVersion)
    const domain = domainOf(page.url)
    const displayTitle = pageLabel(page)
    const displaySubtitle = pageSubtitle(page)
    const hue = hueFromString(domain)
    // Même patron que PageSlot.tsx (mode Focus) : un nouvel onglet vierge
    // reste un composant React (jamais une vraie WebContentsView — voir
    // ViewManager.ensureLive), sans quoi le réveiller affichait une page
    // vide (le document minimal servi par le protocole `aether:`).
    const isNewTab = page.url.startsWith('aether://newtab')
    const viewEnabled = awake && !isNewTab
    // `getBoundingClientRect()` résout déjà les transforms CSS ancêtres
    // (translate/scale de la Toile), donc ce placeholder continue de
    // rapporter les bonnes coordonnées écran pendant le pan/zoom — le
    // recadrage (`viewportRef`) masque la vue tant que la carte n'est pas
    // entièrement dans le viewport visible (voir useViewBounds).
    const boundsRef = useViewBounds(page.id, viewEnabled, viewportRef)

    return (
      <div
        ref={cardRef}
        data-card
        className="group absolute"
        style={{
          left: page.canvas.x,
          top: page.canvas.y,
          width: page.canvas.w,
          height: page.canvas.h
        }}
        onPointerDown={(e) => beginGesture(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          focusPage(page.id)
        }}
      >
        {/* `motion.div` INTÉRIEUR — isolé à la seule animation d'apparition
            (opacity/scale), remplit le cadre extérieur. Voir le commentaire
            sur `cardRef` : `transform` de framer-motion (scale) reste ici,
            jamais mélangé au `transform` de glisser (sur le cadre extérieur). */}
        <motion.div
          initial={{ opacity: 0, scale: 0.965 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32, delay: Math.min(index * 0.025, 0.25) }}
          className={cn(
            'absolute inset-0 overflow-hidden rounded-2xl border bg-mist transition-[border-color,box-shadow] duration-300',
            selected
              ? 'border-glacier/40 shadow-[0_0_0_1px_rgba(169,201,236,0.16),0_28px_90px_-28px_rgba(0,0,0,0.9)]'
              : 'border-white/[0.08] shadow-[0_18px_70px_-24px_rgba(0,0,0,0.85)] hover:border-white/[0.17]'
          )}
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
                <span className="font-mono text-[11px] text-ink-faint">{displaySubtitle}</span>
              </div>
            </div>
          ))}
        {awake && isNewTab && (
          <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ bottom: AWAKE_FOOTER_H }}>
            <NewTabPage pageId={page.id} />
          </div>
        )}
        {awake && !isNewTab && (
          <div
            ref={boundsRef}
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ bottom: AWAKE_FOOTER_H }}
          />
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
            <p className="fade-truncate text-[12.5px] font-medium leading-tight text-ink">{displayTitle}</p>
            <p className="fade-truncate font-mono text-[10px] leading-tight text-ink-dim/70">{displaySubtitle}</p>
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
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-glacier/40 bg-glacier/20 text-glacier"
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
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.12] bg-black/55 text-ink-dim hover:text-ink"
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
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.12] bg-black/55 text-ink-dim hover:text-red-200"
              >
                <X size={12} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </div>

        {/* Actions au survol */}
        <div className="absolute right-2.5 top-2.5 flex shrink-0 gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            title={t('focusCanvas.pageCard.wakeCard')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleAwake(page.id)
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim transition-colors hover:text-ink"
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
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim transition-colors hover:text-ink"
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
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.12] bg-black/55 text-ink-dim transition-colors hover:text-red-200"
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
      </div>
    )
  },
  (prev, next) =>
    prev.page === next.page &&
    prev.selected === next.selected &&
    prev.index === next.index &&
    prev.awake === next.awake
)
