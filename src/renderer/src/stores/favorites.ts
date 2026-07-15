/** Store des favoris — entité indépendante des pages, survit à la fermeture d'un onglet. */
import { create } from 'zustand'
import type { Favorite } from '@shared/types'

interface FavoritesState {
  favorites: Favorite[]
  hydrate(favorites: Favorite[]): void
}

export const useFavoritesStore = create<FavoritesState>()((set) => ({
  favorites: [],
  hydrate: (favorites) => set({ favorites })
}))
