/**
 * Toile spatiale — toile infinie zoomable et pannable.
 *
 * Implémentation : un conteneur fixe + un « monde » transformé
 * (translate3d + scale, origine haut-gauche). La caméra vit dans une ref et
 * mute directement le style — aucun re-rendu React pendant le pan/zoom,
 * donc 60 fps constants. Les cartes sont du pur DOM (aperçus JPEG capturés
 * par le main) : aucune vue web vivante n'est montée ici.
 *
 * Gestes : molette = pan · Ctrl+molette / pincement = zoom vers le curseur ·
 * glisser le fond = pan · double-clic = nouvelle carte à cet endroit.
 */
import { Maximize2, Minus, Orbit, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CanvasView } from '@shared/types'
import type { PageMeta } from '@shared/types'
import { useT } from '@/i18n/useT'
import { getActivePageId } from '@/lib/actions'
import { clamp, debounce } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'
import { PageCard } from './PageCard'
import { PageListBubble } from './PageListBubble'

const ZOOM_MIN = 0.22
const ZOOM_MAX = 2.5
const GRID_STEP = 26

export function SpatialCanvas() {
  const t = useT()
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const space = useSpacesStore((s) => s.spaces.find((sp) => sp.id === s.activeSpaceId) ?? null)
  const pagesMap = usePagesStore((s) => s.pages)
  const selectedId = useUiStore((s) => s.selectedPageId)

  const pages = useMemo(
    () =>
      Object.values(pagesMap)
        .filter((p) => p.spaceId === spaceId)
        .sort((a, b) => a.createdAt - b.createdAt),
    [pagesMap, spaceId]
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const camera = useRef<CanvasView>({ x: 0, y: 0, zoom: 1 })
  const panRef = useRef<{ px: number; py: number; camX: number; camY: number; moved: boolean } | null>(null)
  /** rAF en cours d'une interpolation `animateTo` — annulé avant d'en démarrer
   * une autre ET au changement d'espace, sinon une animation encore en vol au
   * moment où l'utilisateur bascule vers un AUTRE espace continue d'écraser
   * `camera.current` avec la position de l'ANCIEN espace, et cette position
   * périmée finit par être persistée sur le NOUVEL espace une fois
   * l'animation terminée (`persist()` relit `activeSpaceId` au moment où elle
   * s'exécute, pas au moment où l'animation a démarré). */
  const animFrame = useRef<number | null>(null)
  const [zoomDisplay, setZoomDisplay] = useState(1)
  const [panning, setPanning] = useState(false)
  /** Cartes ayant déjà déclenché un rafraîchissement d'aperçu haute résolution
   * — une seule requête par page suffit (l'aperçu capturé reste net jusqu'à
   * la prochaine navigation, qui recapture de toute façon). */
  const refreshedPreviews = useRef<Set<string>>(new Set())

  /** Applique la caméra au DOM (transform + grille de points). */
  const apply = useCallback((): void => {
    const { x, y, zoom } = camera.current
    if (worldRef.current) {
      worldRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`
    }
    if (containerRef.current) {
      const step = GRID_STEP * zoom
      containerRef.current.style.backgroundSize = `${step}px ${step}px`
      containerRef.current.style.backgroundPosition = `${x}px ${y}px`
    }
  }, [])

  const persist = useMemo(
    () =>
      debounce(() => {
        const id = useSpacesStore.getState().activeSpaceId
        if (!id) return
        const view = { ...camera.current }
        useSpacesStore.getState().setCanvasView(id, view)
        window.aether.spaces.updateCanvas(id, view)
      }, 320),
    []
  )

  const syncZoomDisplay = useMemo(
    () => debounce(() => setZoomDisplay(camera.current.zoom), 90),
    []
  )

  // Rafraîchit l'aperçu (résolution/qualité relevées, voir main/previews.ts)
  // dès qu'une carte apparaît sur la Toile — les fichiers déjà sur disque ont
  // pu être capturés AVANT ce relèvement (ancienne session, ou simplement
  // jamais recapturés depuis) et restent flous indéfiniment sans ça. Un seuil
  // basé sur la largeur effective à l'écran (largeur × zoom) avait été essayé
  // mais ne se déclenchait quasiment jamais en pratique : la largeur par
  // défaut d'une carte (360px, voir DEFAULT_CARD dans main/ipc.ts) reste sous
  // n'importe quel seuil raisonnable même au zoom maximal (900px à ×2.5) — la
  // plupart des cartes n'étaient donc jamais rafraîchies. `views.capture()`
  // ne fait rien pour une page qui n'est pas vivante (canvas.ts ne monte
  // aucune vue web), donc cette requête est sans coût pour les autres.
  useEffect(() => {
    for (const page of pages) {
      if (refreshedPreviews.current.has(page.id)) continue
      refreshedPreviews.current.add(page.id)
      window.aether.pages.requestPreview(page.id)
    }
  }, [pages])

  // Bascule vers la Toile (ce composant est démonté/remonté à chaque
  // changement de mode, cf App.tsx) : cadre intelligemment la caméra plutôt
  // que de restaurer aveuglément la dernière position. Onglet actif → centré
  // dessus (on « suit » ce qu'on regardait en Focus) ; sinon → vue d'ensemble.
  useLayoutEffect(() => {
    if (!space) return
    if (animFrame.current !== null) {
      cancelAnimationFrame(animFrame.current)
      animFrame.current = null
    }
    const activeId = getActivePageId()
    const activePage = activeId ? pages.find((p) => p.id === activeId) : null
    if (activePage) {
      camera.current = fitView([activePage.canvas], containerSize())
    } else if (pages.length > 0) {
      camera.current = fitView(pages.map((p) => p.canvas), containerSize())
    } else {
      camera.current = { x: containerSize().w / 2, y: containerSize().h / 2, zoom: 1 }
    }
    apply()
    setZoomDisplay(camera.current.zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  const containerSize = (): { w: number; h: number } => ({
    w: containerRef.current?.clientWidth ?? 1200,
    h: containerRef.current?.clientHeight ?? 800
  })

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number): void => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const z1 = camera.current.zoom
      const z2 = clamp(z1 * factor, ZOOM_MIN, ZOOM_MAX)
      if (z2 === z1) return
      const k = z2 / z1
      camera.current = {
        x: px - (px - camera.current.x) * k,
        y: py - (py - camera.current.y) * k,
        zoom: z2
      }
      apply()
      persist()
      syncZoomDisplay()
    },
    [apply, persist, syncZoomDisplay]
  )

  // La molette exige un listener non-passif pour preventDefault.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0024))
      } else {
        camera.current.x -= e.deltaX
        camera.current.y -= e.deltaY
        apply()
        persist()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [apply, persist, zoomAt])

  // Annule toute interpolation `animateTo` encore en vol au démontage (bascule
  // vers le mode Focus, cf. App.tsx) — sinon son rAF continue de s'exécuter
  // après coup et finit par persister une position de caméra périmée.
  useEffect(() => {
    return () => {
      if (animFrame.current !== null) cancelAnimationFrame(animFrame.current)
    }
  }, [])

  const isBackground = (target: EventTarget): boolean =>
    target === containerRef.current || target === worldRef.current

  const onPointerDown = (e: React.PointerEvent): void => {
    // Bouton milieu = pan partout ; bouton gauche = pan sur le fond seulement
    // (les cartes stoppent la propagation du bouton gauche).
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 0 && !isBackground(e.target)) return
    containerRef.current?.setPointerCapture(e.pointerId)
    panRef.current = {
      px: e.clientX,
      py: e.clientY,
      camX: camera.current.x,
      camY: camera.current.y,
      moved: false
    }
    setPanning(true)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const pan = panRef.current
    if (!pan) return
    const dx = e.clientX - pan.px
    const dy = e.clientY - pan.py
    if (Math.hypot(dx, dy) > 3) pan.moved = true
    camera.current.x = pan.camX + dx
    camera.current.y = pan.camY + dy
    apply()
  }

  const onPointerUp = (): void => {
    const pan = panRef.current
    panRef.current = null
    setPanning(false)
    if (pan) {
      if (pan.moved) persist()
      else useUiStore.getState().select(null) // simple clic sur le fond : désélection
    }
  }

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (!isBackground(e.target)) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const wx = (e.clientX - rect.left - camera.current.x) / camera.current.zoom
    const wy = (e.clientY - rect.top - camera.current.y) / camera.current.zoom
    useUiStore.getState().openOverlay('intention', {
      canvasPos: { x: wx - 180, y: wy - 130 }
    })
  }

  /** Interpolation douce vers une vue cible. */
  const animateTo = useCallback(
    (target: CanvasView): void => {
      if (animFrame.current !== null) cancelAnimationFrame(animFrame.current)
      const start = { ...camera.current }
      const t0 = performance.now()
      const duration = 340
      const step = (t: number): void => {
        const k = Math.min(1, (t - t0) / duration)
        const ease = 1 - Math.pow(1 - k, 3)
        camera.current = {
          x: start.x + (target.x - start.x) * ease,
          y: start.y + (target.y - start.y) * ease,
          zoom: start.zoom + (target.zoom - start.zoom) * ease
        }
        apply()
        if (k < 1) {
          animFrame.current = requestAnimationFrame(step)
        } else {
          animFrame.current = null
          persist()
          setZoomDisplay(camera.current.zoom)
        }
      }
      animFrame.current = requestAnimationFrame(step)
    },
    [apply, persist]
  )

  const fitAll = (): void => {
    if (pages.length === 0) {
      animateTo({ x: containerSize().w / 2, y: containerSize().h / 2, zoom: 1 })
      return
    }
    animateTo(fitView(pages.map((p) => p.canvas), containerSize()))
  }

  const getZoom = useCallback(() => camera.current.zoom, [])

  /** Aimante la caméra sur une page donnée (bulle de liste, coin haut-droit). */
  const focusOnPage = (page: PageMeta): void => {
    animateTo(fitView([page.canvas], containerSize()))
    useUiStore.getState().select(page.id)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
        cursor: panning ? 'grabbing' : 'default'
      }}
    >
      <div ref={worldRef} className="absolute left-0 top-0 h-0 w-0 origin-top-left will-change-transform">
        {pages.map((page, i) => (
          <PageCard
            key={page.id}
            page={page}
            index={i}
            selected={page.id === selectedId}
            getZoom={getZoom}
          />
        ))}
      </div>

      {pages.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <Orbit size={22} strokeWidth={1.2} className="text-ink-faint/70" />
            <p className="text-[13px] font-light text-ink-faint">
              {t('focusCanvas.spatialCanvas.emptyTitle')}
            </p>
            <p className="text-[11px] text-ink-faint/70">
              {t('focusCanvas.spatialCanvas.emptyHint')}
            </p>
            <button
              type="button"
              onClick={() => useUiStore.getState().openOverlay('intention')}
              className="pointer-events-auto rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
            >
              {t('focusCanvas.spatialCanvas.expressIntention')}
            </button>
          </div>
        </div>
      )}

      <PageListBubble pages={pages} selectedId={selectedId} onSelect={focusOnPage} />

      {/* Commandes de zoom */}
      <div className="glass absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl p-1">
        <button
          type="button"
          title={t('focusCanvas.spatialCanvas.zoomOut')}
          onClick={() => {
            const { w, h } = containerSize()
            const rect = containerRef.current?.getBoundingClientRect()
            zoomAt((rect?.left ?? 0) + w / 2, (rect?.top ?? 0) + h / 2, 1 / 1.25)
          }}
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <Minus size={13} strokeWidth={1.7} />
        </button>
        <span className="w-11 text-center font-mono text-[10.5px] tabular-nums text-ink-faint">
          {Math.round(zoomDisplay * 100)}%
        </span>
        <button
          type="button"
          title={t('focusCanvas.spatialCanvas.zoomIn')}
          onClick={() => {
            const { w, h } = containerSize()
            const rect = containerRef.current?.getBoundingClientRect()
            zoomAt((rect?.left ?? 0) + w / 2, (rect?.top ?? 0) + h / 2, 1.25)
          }}
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <Plus size={13} strokeWidth={1.7} />
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-white/[0.08]" />
        <button
          type="button"
          title={t('focusCanvas.spatialCanvas.fitAll')}
          onClick={fitAll}
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <Maximize2 size={12} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}

/** Vue caméra cadrant l'ensemble des rectangles donnés. */
function fitView(
  rects: { x: number; y: number; w: number; h: number }[],
  size: { w: number; h: number }
): CanvasView {
  const minX = Math.min(...rects.map((r) => r.x)) - 90
  const minY = Math.min(...rects.map((r) => r.y)) - 90
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + 90
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + 90
  const zoom = clamp(Math.min(size.w / (maxX - minX), size.h / (maxY - minY)), ZOOM_MIN, 1.15)
  return {
    x: size.w / 2 - ((minX + maxX) / 2) * zoom,
    y: size.h / 2 - ((minY + maxY) / 2) * zoom,
    zoom
  }
}
