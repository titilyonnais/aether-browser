/** Store des espaces : liste, espace actif, caméra de toile par espace. */
import { create } from 'zustand'
import type { CanvasView, Space, SpaceId } from '@shared/types'

interface SpacesState {
  spaces: Space[]
  activeSpaceId: SpaceId | null

  hydrate(spaces: Space[], activeSpaceId: SpaceId): void
  upsert(space: Space): void
  removeLocal(id: SpaceId): void
  setActiveLocal(id: SpaceId): void
  renameLocal(id: SpaceId, name: string): void
  /** Met à jour la caméra localement (la persistance est débouncée ailleurs). */
  setCanvasView(id: SpaceId, view: CanvasView): void

  active(): Space | null
}

export const useSpacesStore = create<SpacesState>()((set, get) => ({
  spaces: [],
  activeSpaceId: null,

  hydrate: (spaces, activeSpaceId) => set({ spaces, activeSpaceId }),

  upsert: (space) => {
    const spaces = get().spaces.filter((s) => s.id !== space.id)
    set({ spaces: [...spaces, space].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt) })
  },

  removeLocal: (id) => set({ spaces: get().spaces.filter((s) => s.id !== id) }),

  setActiveLocal: (id) => set({ activeSpaceId: id }),

  renameLocal: (id, name) =>
    set({ spaces: get().spaces.map((s) => (s.id === id ? { ...s, name } : s)) }),

  setCanvasView: (id, view) =>
    set({ spaces: get().spaces.map((s) => (s.id === id ? { ...s, canvas: view } : s)) }),

  active: () => {
    const { spaces, activeSpaceId } = get()
    return spaces.find((s) => s.id === activeSpaceId) ?? null
  }
}))
