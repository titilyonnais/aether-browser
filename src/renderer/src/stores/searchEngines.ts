/** Store des moteurs de recherche personnalisés (ajoutés par l'utilisateur). */
import { create } from 'zustand'
import type { CustomSearchEngine } from '@shared/types'

interface SearchEnginesState {
  custom: CustomSearchEngine[]
  loaded: boolean
  hydrate(list: CustomSearchEngine[]): void
  add(engine: CustomSearchEngine): void
  removeLocal(id: string): void
  ensureLoaded(): Promise<void>
}

export const useSearchEnginesStore = create<SearchEnginesState>()((set, get) => ({
  custom: [],
  loaded: false,

  hydrate: (custom) => set({ custom, loaded: true }),
  add: (engine) => set({ custom: [...get().custom, engine] }),
  removeLocal: (id) => set({ custom: get().custom.filter((e) => e.id !== id) }),

  ensureLoaded: async () => {
    if (get().loaded) return
    const list = await window.aether.searchEngines.list()
    set({ custom: list, loaded: true })
  }
}))
