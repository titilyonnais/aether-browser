/**
 * Store des pages : registre global + état du mode Focus par espace
 * (split view : 0 à 2 emplacements, orientation, ratio).
 */
import { create } from 'zustand'
import type { AffinityLink, CanvasRect, PageId, PageMeta, SpaceId } from '@shared/types'

export interface FocusState {
  /** Pages affichées (1 ou 2 en vue scindée). */
  slots: PageId[]
  orientation: 'h' | 'v'
  ratio: number
  activeSlot: number
}

/** Référence stable : évite les re-rendus fantômes dans les sélecteurs Zustand. */
const DEFAULT_FOCUS: FocusState = Object.freeze({
  slots: [],
  orientation: 'h',
  ratio: 0.5,
  activeSlot: 0
}) as FocusState

interface PagesState {
  pages: Record<PageId, PageMeta>
  focusBySpace: Record<SpaceId, FocusState>
  affinities: AffinityLink[]

  hydrate(pages: PageMeta[]): void
  upsert(meta: PageMeta): void
  removeLocal(id: PageId): void
  bumpPreview(id: PageId, version: number): void
  updateCanvasLocal(id: PageId, rect: CanvasRect): void
  setAffinities(links: AffinityLink[]): void

  focusOf(spaceId: SpaceId | null): FocusState
  setFocus(spaceId: SpaceId, patch: Partial<FocusState>): void

  bySpace(spaceId: SpaceId | null): PageMeta[]
}

export const usePagesStore = create<PagesState>()((set, get) => ({
  pages: {},
  focusBySpace: {},
  affinities: [],

  hydrate: (list) => {
    const pages: Record<PageId, PageMeta> = {}
    for (const p of list) pages[p.id] = p
    set({ pages })
  },

  upsert: (meta) => set({ pages: { ...get().pages, [meta.id]: meta } }),

  removeLocal: (id) => {
    const pages = { ...get().pages }
    delete pages[id]
    // Retire la page de tous les emplacements Focus.
    const focusBySpace = { ...get().focusBySpace }
    for (const [spaceId, focus] of Object.entries(focusBySpace)) {
      if (focus.slots.includes(id)) {
        const slots = focus.slots.filter((s) => s !== id)
        focusBySpace[spaceId] = {
          ...focus,
          slots,
          activeSlot: Math.min(focus.activeSlot, Math.max(0, slots.length - 1))
        }
      }
    }
    set({ pages, focusBySpace })
  },

  bumpPreview: (id, version) => {
    const page = get().pages[id]
    if (page) set({ pages: { ...get().pages, [id]: { ...page, previewVersion: version } } })
  },

  updateCanvasLocal: (id, rect) => {
    const page = get().pages[id]
    if (page) set({ pages: { ...get().pages, [id]: { ...page, canvas: rect } } })
  },

  setAffinities: (affinities) => set({ affinities }),

  focusOf: (spaceId) => (spaceId ? (get().focusBySpace[spaceId] ?? DEFAULT_FOCUS) : DEFAULT_FOCUS),

  setFocus: (spaceId, patch) => {
    const current = get().focusBySpace[spaceId] ?? DEFAULT_FOCUS
    set({ focusBySpace: { ...get().focusBySpace, [spaceId]: { ...current, ...patch } } })
  },

  bySpace: (spaceId) => {
    if (!spaceId) return []
    return Object.values(get().pages)
      .filter((p) => p.spaceId === spaceId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }
}))
