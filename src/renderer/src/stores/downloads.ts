/** Store des téléchargements : liste + badge d'activité. */
import { create } from 'zustand'
import type { DownloadEntry } from '@shared/types'

interface DownloadsState {
  entries: DownloadEntry[]
  loaded: boolean
  hydrate(entries: DownloadEntry[]): void
  activeCount(): number
}

export const useDownloadsStore = create<DownloadsState>()((set, get) => ({
  entries: [],
  loaded: false,

  hydrate: (entries) => set({ entries, loaded: true }),

  activeCount: () => get().entries.filter((d) => d.state === 'progressing').length
}))
