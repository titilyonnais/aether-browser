import type { AetherApi } from '../shared/ipc'

declare global {
  interface Window {
    /** API ÆTHER exposée par le preload (contextBridge). */
    aether: AetherApi
  }
}

export {}
