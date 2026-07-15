/** Store des profils : liste + profil actif. */
import { create } from 'zustand'
import type { Profile, ProfileId } from '@shared/types'

interface ProfilesState {
  profiles: Profile[]
  activeProfileId: ProfileId | null

  hydrate(profiles: Profile[], activeProfileId: ProfileId): void
  setProfiles(profiles: Profile[]): void
  upsert(profile: Profile): void
  setActiveLocal(id: ProfileId): void
  renameLocal(id: ProfileId, name: string): void

  active(): Profile | null
}

export const useProfilesStore = create<ProfilesState>()((set, get) => ({
  profiles: [],
  activeProfileId: null,

  hydrate: (profiles, activeProfileId) => set({ profiles, activeProfileId }),
  setProfiles: (profiles) => set({ profiles }),

  upsert: (profile) => {
    const profiles = get().profiles.filter((p) => p.id !== profile.id)
    set({ profiles: [...profiles, profile].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt) })
  },

  setActiveLocal: (activeProfileId) => set({ activeProfileId }),

  renameLocal: (id, name) =>
    set({ profiles: get().profiles.map((p) => (p.id === id ? { ...p, name } : p)) }),

  active: () => {
    const { profiles, activeProfileId } = get()
    return profiles.find((p) => p.id === activeProfileId) ?? null
  }
}))
