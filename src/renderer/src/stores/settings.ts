/** Store des réglages + statut IA + statut du compte Google. */
import { create } from 'zustand'
import type { AiStatus, AppSettings, AppVersions, GoogleStatus, SettingsPatch } from '@shared/types'

interface SettingsState {
  settings: AppSettings | null
  aiStatus: AiStatus | null
  versions: AppVersions | null
  /** État live (email courant) — distinct de `settings.hasGoogleAccount`,
   * comme `aiStatus` l'est de `settings.hasAnthropicKey` etc. */
  googleStatus: GoogleStatus | null

  hydrate(settings: AppSettings, aiStatus: AiStatus, versions: AppVersions): void
  setAiStatus(status: AiStatus): void
  setGoogleStatus(status: GoogleStatus): void
  patch(p: SettingsPatch): Promise<void>
  refreshAi(): Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  aiStatus: null,
  versions: null,
  googleStatus: null,

  hydrate: (settings, aiStatus, versions) => set({ settings, aiStatus, versions }),

  setAiStatus: (aiStatus) => set({ aiStatus }),

  setGoogleStatus: (googleStatus) => set({ googleStatus }),

  patch: async (p) => {
    const next = await window.aether.settings.set(p)
    set({ settings: next })
  },

  refreshAi: async () => {
    const status = await window.aether.ai.refreshStatus()
    set({ aiStatus: status })
  }
}))
