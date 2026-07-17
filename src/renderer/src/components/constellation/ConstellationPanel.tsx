/**
 * Constellation — panneau gauche.
 * Miroir spatial de la toile : chaque page est une étoile positionnée
 * d'après ses coordonnées monde. Les traits pleins relient les filiations
 * (page ouverte depuis une autre), les pointillés les affinités sémantiques
 * (embeddings). Les étoiles se déplacent — la toile suit, et inversement.
 */
import { motion } from 'framer-motion'
import { Check, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageMeta, SpaceId } from '@shared/types'
import { useT } from '@/i18n/useT'
import {
  createSpace,
  duplicateSpace,
  focusPage,
  getActivePageId,
  removeSpace,
  renameSpace,
  switchSpace
} from '@/lib/actions'
import { cn, domainOf, hueColor } from '@/lib/utils'
import { useMuseStore } from '@/stores/muse'
import { usePagesStore } from '@/stores/pages'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

const PANEL_MIN_WIDTH = 220
const PANEL_MAX_WIDTH = 480
const PANEL_DEFAULT_WIDTH = 288
const PANEL_WIDTH_KEY = 'aether:constellationWidth'

/** Largeur du panneau, redimensionnable (bord droit) et mémorisée entre sessions. */
function usePanelWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    return stored >= PANEL_MIN_WIDTH && stored <= PANEL_MAX_WIDTH ? stored : PANEL_DEFAULT_WIDTH
  })
  const setClamped = (w: number): void => {
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w))
    setWidth(clamped)
    localStorage.setItem(PANEL_WIDTH_KEY, String(clamped))
  }
  return [width, setClamped]
}

export function ConstellationPanel() {
  const t = useT()
  const open = useUiStore((s) => s.constellationOpen)
  const [width, setWidth] = usePanelWidth()
  const [isDragging, setIsDragging] = useState(false)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width
    const onMove = (ev: MouseEvent): void => setWidth(startWidth + (ev.clientX - startX))
    const onUp = (): void => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? width : 0 }}
      transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 38 }}
      className="relative z-20 shrink-0 overflow-hidden border-r hairline bg-abyss/50"
    >
      <div className="flex h-full flex-col" style={{ width }}>
        <SpacesList />
        <div className="mx-4 h-px shrink-0 bg-white/[0.05]" />
        <ConstellationGraph />
        <PanelFooter />
      </div>
      {open && (
        <div
          onMouseDown={startResize}
          title={t('shell.constellation.resizeHandle')}
          className={cn(
            'absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-glacier/40',
            isDragging && 'bg-glacier/50'
          )}
        />
      )}
    </motion.aside>
  )
}

// ─── Liste des espaces ───────────────────────────────────────────────────────

function SpacesList() {
  const t = useT()
  const spaces = useSpacesStore((s) => s.spaces)
  const activeSpaceId = useSpacesStore((s) => s.activeSpaceId)
  const pages = usePagesStore((s) => s.pages)
  const [editingId, setEditingId] = useState<SpaceId | null>(null)
  const [confirmId, setConfirmId] = useState<SpaceId | null>(null)
  const [draft, setDraft] = useState('')

  const countFor = (id: SpaceId): number =>
    Object.values(pages).filter((p) => p.spaceId === id).length

  const commitRename = (id: SpaceId): void => {
    if (draft.trim()) void renameSpace(id, draft.trim())
    setEditingId(null)
  }

  // « Renommer » depuis le menu contextuel natif (clic droit) : bascule cet espace en édition.
  useEffect(() => {
    return window.aether.spaces.onStartRename((id) => {
      const space = useSpacesStore.getState().spaces.find((s) => s.id === id)
      if (!space) return
      setDraft(space.name)
      setEditingId(id)
    })
  }, [])

  return (
    <div className="shrink-0 space-y-0.5 p-2 pt-3">
      <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {t('shell.constellation.spacesHeader')}
      </p>
      {spaces.map((space) => (
        <div
          key={space.id}
          title={t('shell.constellation.spaceRowHint')}
          onContextMenu={(e) => {
            e.preventDefault()
            window.aether.spaces.showContextMenu(space.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 })
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              void duplicateSpace(space.id)
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault()
          }}
          className={cn(
            'group flex h-9 items-center gap-2.5 rounded-lg px-3 transition-colors',
            space.id === activeSpaceId
              ? 'bg-white/[0.05] text-ink'
              : 'text-ink-dim hover:bg-white/[0.03] hover:text-ink'
          )}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: hueColor(space.hue, 0.95),
              boxShadow: `0 0 10px ${hueColor(space.hue, 0.45)}`
            }}
          />
          {editingId === space.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(space.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(space.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
            />
          ) : (
            <button
              type="button"
              onClick={() => switchSpace(space.id)}
              className="min-w-0 flex-1 truncate text-left text-[13px]"
            >
              {space.name}
            </button>
          )}

          {confirmId === space.id ? (
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                title={t('shell.constellation.confirmDelete')}
                aria-label={t('shell.constellation.confirmDelete')}
                onClick={() => {
                  setConfirmId(null)
                  void removeSpace(space.id)
                }}
                className="grid h-6 w-6 place-items-center rounded-md text-red-300/90 hover:bg-red-400/10"
              >
                <Check size={12} strokeWidth={2} />
              </button>
              <button
                type="button"
                title={t('shell.constellation.cancel')}
                aria-label={t('shell.constellation.cancel')}
                onClick={() => setConfirmId(null)}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-white/[0.05]"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ) : (
            <span className="hidden items-center gap-0.5 group-hover:flex">
              <button
                type="button"
                title={t('shell.constellation.rename')}
                aria-label={t('shell.constellation.rename')}
                onClick={() => {
                  setDraft(space.name)
                  setEditingId(space.id)
                }}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
              >
                <Pencil size={11} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                title={t('shell.constellation.dissolveSpace')}
                aria-label={t('shell.constellation.dissolveSpace')}
                onClick={() => setConfirmId(space.id)}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-red-400/10 hover:text-red-200"
              >
                <Trash2 size={11} strokeWidth={1.8} />
              </button>
            </span>
          )}
          <span className="text-[10px] tabular-nums text-ink-faint group-hover:hidden">
            {countFor(space.id) || ''}
          </span>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          void createSpace(t('shell.constellation.newSpace'))
        }}
        className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[12.5px] text-ink-faint transition-colors hover:bg-white/[0.03] hover:text-ink-dim"
      >
        <Plus size={12} strokeWidth={1.8} />
        {t('shell.constellation.newSpace')}
      </button>
    </div>
  )
}

// ─── Graphe constellation ────────────────────────────────────────────────────

interface Node {
  page: PageMeta
  wx: number
  wy: number
}

function ConstellationGraph() {
  const t = useT()
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const space = useSpacesStore((s) => s.spaces.find((sp) => sp.id === s.activeSpaceId))
  const pagesMap = usePagesStore((s) => s.pages)
  const focusBySpace = usePagesStore((s) => s.focusBySpace)
  void focusBySpace // abonnement : l'étoile active dépend du focus
  const affinities = usePagesStore((s) => s.affinities)
  const selectedId = useUiStore((s) => s.selectedPageId)
  const activeId = getActivePageId()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 272, h: 300 })
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nodes: Node[] = useMemo(
    () =>
      Object.values(pagesMap)
        .filter((p) => p.spaceId === spaceId)
        .map((p) => ({ page: p, wx: p.canvas.x + p.canvas.w / 2, wy: p.canvas.y + p.canvas.h / 2 })),
    [pagesMap, spaceId]
  )

  // Transformation monde → panneau, recalculée quand la composition change.
  const idsKey = nodes
    .map((n) => n.page.id)
    .sort()
    .join(',')
  const fit = useMemo(() => {
    if (nodes.length === 0) return { cx: 0, cy: 0, scale: 0.16 }
    const xs = nodes.map((n) => n.wx)
    const ys = nodes.map((n) => n.wy)
    const minX = Math.min(...xs) - 240
    const maxX = Math.max(...xs) + 240
    const minY = Math.min(...ys) - 200
    const maxY = Math.max(...ys) + 200
    const scale = Math.min(box.w / (maxX - minX), box.h / (maxY - minY), 0.3)
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, idsKey, box.w, box.h])

  const toPanel = (wx: number, wy: number): { x: number; y: number } => ({
    x: (wx - fit.cx) * fit.scale + box.w / 2,
    y: (wy - fit.cy) * fit.scale + box.h / 2
  })

  const nodeById = new Map(nodes.map((n) => [n.page.id, n]))

  const onNodePointerDown = (e: React.PointerEvent, node: Node): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = {
      id: node.page.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.page.canvas.x,
      origY: node.page.canvas.y,
      moved: false
    }
  }

  const onNodePointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (e.clientX - drag.startX) / fit.scale
    const dy = (e.clientY - drag.startY) / fit.scale
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return
    drag.moved = true
    const page = usePagesStore.getState().pages[drag.id]
    if (page) {
      usePagesStore
        .getState()
        .updateCanvasLocal(drag.id, { ...page.canvas, x: drag.origX + dx, y: drag.origY + dy })
    }
  }

  const onNodePointerUp = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const page = usePagesStore.getState().pages[drag.id]
    if (!page) return
    if (drag.moved) {
      window.aether.pages.updateCanvas(drag.id, page.canvas)
    } else {
      useUiStore.getState().select(drag.id)
      focusPage(drag.id)
    }
    void e
  }

  const hoveredPage = hovered ? (pagesMap[hovered.id] ?? null) : null

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      {nodes.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            {t('shell.constellation.emptyGraphLine1')}
            <br />
            {t('shell.constellation.emptyGraphLine2')}
          </p>
        </div>
      ) : (
        <svg width={box.w} height={box.h} className="absolute inset-0">
          <defs>
            {nodes.map((n) => (
              <clipPath key={n.page.id} id={`nc-${n.page.id}`}>
                <circle r={7} />
              </clipPath>
            ))}
          </defs>

          {/* Liens de filiation */}
          {nodes.map((n) => {
            const parent = n.page.parentId ? nodeById.get(n.page.parentId) : null
            if (!parent) return null
            const a = toPanel(n.wx, n.wy)
            const b = toPanel(parent.wx, parent.wy)
            return (
              <line
                key={`p-${n.page.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            )
          })}

          {/* Liens d'affinité sémantique */}
          {affinities.map((link) => {
            const a = nodeById.get(link.a)
            const b = nodeById.get(link.b)
            if (!a || !b) return null
            const pa = toPanel(a.wx, a.wy)
            const pb = toPanel(b.wx, b.wy)
            return (
              <line
                key={`a-${link.a}-${link.b}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={`rgba(169,201,236,${0.08 + link.score * 0.14})`}
                strokeWidth={1}
                strokeDasharray="2 5"
              />
            )
          })}

          {/* Étoiles */}
          {nodes.map((n) => {
            const p = toPanel(n.wx, n.wy)
            const isActive = n.page.id === activeId
            const isSelected = n.page.id === selectedId
            const domain = domainOf(n.page.url)
            const hue = space?.hue ?? 210
            return (
              <g
                key={n.page.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerMove={onNodePointerMove}
                onPointerUp={onNodePointerUp}
                onPointerEnter={() => setHovered({ id: n.page.id, x: p.x, y: p.y })}
                onPointerLeave={() => setHovered(null)}
              >
                {isActive && <circle r={11} className="node-ring" fill="none" stroke={hueColor(hue, 0.5)} strokeWidth={1} />}
                <circle
                  r={9}
                  fill={`hsl(${hue} 24% ${isSelected || isActive ? 20 : 14}%)`}
                  stroke={
                    isSelected
                      ? 'rgba(169,201,236,0.55)'
                      : isActive
                        ? hueColor(hue, 0.5)
                        : 'rgba(255,255,255,0.14)'
                  }
                  strokeWidth={1}
                />
                {n.page.faviconUrl ? (
                  <image
                    href={n.page.faviconUrl}
                    x={-7}
                    y={-7}
                    width={14}
                    height={14}
                    clipPath={`url(#nc-${n.page.id})`}
                    style={{ pointerEvents: 'none' }}
                  />
                ) : (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={8}
                    fill={hueColor(hue, 0.85)}
                    style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                  >
                    {domain.charAt(0)}
                  </text>
                )}
                {n.page.isLive && (
                  <circle cx={7} cy={-7} r={2} fill="rgba(169,201,236,0.9)">
                    <animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {/* Info-bulle */}
      {hovered && hoveredPage && !dragRef.current && (
        <div
          className="glass-strong pointer-events-none absolute z-10 max-w-56 rounded-lg px-2.5 py-1.5"
          style={{
            left: Math.min(Math.max(hovered.x - 60, 8), box.w - 180),
            top: Math.max(hovered.y - 52, 8)
          }}
        >
          <p className="fade-truncate text-[11.5px] text-ink">
            {hoveredPage.title || t('shell.constellation.untitled')}
          </p>
          <p className="fade-truncate font-mono text-[9.5px] text-ink-faint">{domainOf(hoveredPage.url)}</p>
        </div>
      )}

      {/* Légende — dit ce que le graphe montre (clic = ouvrir, glisser = déplacer). */}
      {nodes.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-3 flex flex-col gap-1 text-[9px] text-ink-faint/80">
          <span className="flex items-center gap-1.5">
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
            </svg>
            {t('shell.constellation.legendParent')}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="rgba(169,201,236,0.5)" strokeWidth="1" strokeDasharray="2 3" />
            </svg>
            {t('shell.constellation.legendAffinity')}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Pied de panneau ─────────────────────────────────────────────────────────

function PanelFooter() {
  const t = useT()
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const pages = usePagesStore((s) => s.pages)
  const notes = useMuseStore((s) => s.notes)
  const pageCount = Object.values(pages).filter((p) => p.spaceId === spaceId).length
  const noteCount = notes.filter((n) => n.spaceId === spaceId).length
  const pageLabel = t(
    pageCount > 1 ? 'shell.constellation.pageCountPlural' : 'shell.constellation.pageCount',
    { count: pageCount }
  )
  const noteLabel = t(
    noteCount > 1 ? 'shell.constellation.noteCountPlural' : 'shell.constellation.noteCount',
    { count: noteCount }
  )

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t hairline px-4">
      <span className="text-[10.5px] text-ink-faint">
        {pageLabel} · {noteLabel}
      </span>
      <button
        type="button"
        title={t('shell.constellation.settingsTitle')}
        onClick={() => useUiStore.getState().openOverlay('settings')}
        className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
      >
        <Settings2 size={13} strokeWidth={1.7} />
      </button>
    </footer>
  )
}
