/** Store des dossiers de favoris (rangement) — liste plate, cloisonnée par profil côté main. */
import { create } from 'zustand'
import type { FavoriteFolder } from '@shared/types'

interface FavoriteFoldersState {
  folders: FavoriteFolder[]
  hydrate(folders: FavoriteFolder[]): void
}

export const useFavoriteFoldersStore = create<FavoriteFoldersState>()((set) => ({
  folders: [],
  hydrate: (folders) => set({ folders })
}))
