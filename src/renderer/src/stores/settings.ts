/** Store des réglages + statut IA. */
import { create } from 'zustand'
import type { AiStatus, AppSettings, AppVersions, SettingsPatch } from '@shared/types'

interface SettingsState {
  settings: AppSettings | null
  aiStatus: AiStatus | null
  versions: AppVersions | null

  hydrate(settings: AppSettings, aiStatus: AiStatus, versions: AppVersions): void
  setAiStatus(status: AiStatus): void
  patch(p: SettingsPatch): Promise<void>
  refreshAi(): Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  aiStatus: null,
  versions: null,

  hydrate: (settings, aiStatus, versions) => set({ settings, aiStatus, versions }),

  setAiStatus: (aiStatus) => set({ aiStatus }),

  patch: async (p) => {
    const next = await window.aether.settings.set(p)
    set({ settings: next })
  },

  refreshAi: async () => {
    const status = await window.aether.ai.refreshStatus()
    set({ aiStatus: status })
  }
}))
