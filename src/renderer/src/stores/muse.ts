/** Store de Muse : fils de conversation par espace, streaming, notes. */
import { create } from 'zustand'
import type { NoteItem, ProviderKind, SpaceId } from '@shared/types'

export interface MuseMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'done' | 'error'
  provider: ProviderKind | null
}

interface MuseState {
  messagesBySpace: Record<SpaceId, MuseMessage[]>
  streamingId: string | null
  notes: NoteItem[]
  tab: 'chat' | 'notes'
  includePageContext: boolean

  hydrateNotes(notes: NoteItem[]): void
  setTab(tab: 'chat' | 'notes'): void
  setIncludePageContext(v: boolean): void

  append(spaceId: SpaceId, msg: MuseMessage): void
  appendDelta(requestId: string, delta: string): void
  finalize(requestId: string, error: string | null, provider: ProviderKind | null): void
  setStreaming(id: string | null): void
  clearThread(spaceId: SpaceId): void

  addNote(note: NoteItem): void
  updateNoteContent(id: string, content: string): void
  removeNote(id: string): void
}

export const useMuseStore = create<MuseState>()((set, get) => ({
  messagesBySpace: {},
  streamingId: null,
  notes: [],
  tab: 'chat',
  includePageContext: true,

  hydrateNotes: (notes) => set({ notes }),
  setTab: (tab) => set({ tab }),
  setIncludePageContext: (includePageContext) => set({ includePageContext }),

  append: (spaceId, msg) => {
    const current = get().messagesBySpace[spaceId] ?? []
    set({ messagesBySpace: { ...get().messagesBySpace, [spaceId]: [...current, msg] } })
  },

  appendDelta: (requestId, delta) => {
    const spaces = get().messagesBySpace
    for (const [spaceId, msgs] of Object.entries(spaces)) {
      const idx = msgs.findIndex((m) => m.id === requestId)
      if (idx >= 0) {
        const updated = [...msgs]
        updated[idx] = { ...updated[idx], content: updated[idx].content + delta }
        set({ messagesBySpace: { ...spaces, [spaceId]: updated } })
        return
      }
    }
  },

  finalize: (requestId, error, provider) => {
    const spaces = get().messagesBySpace
    for (const [spaceId, msgs] of Object.entries(spaces)) {
      const idx = msgs.findIndex((m) => m.id === requestId)
      if (idx >= 0) {
        const updated = [...msgs]
        const msg = updated[idx]
        updated[idx] = {
          ...msg,
          status: error ? 'error' : 'done',
          content: error ? (msg.content ? msg.content : error) : msg.content,
          provider
        }
        set({
          messagesBySpace: { ...spaces, [spaceId]: updated },
          streamingId: get().streamingId === requestId ? null : get().streamingId
        })
        return
      }
    }
  },

  setStreaming: (streamingId) => set({ streamingId }),

  clearThread: (spaceId) => {
    const spaces = { ...get().messagesBySpace }
    delete spaces[spaceId]
    set({ messagesBySpace: spaces })
  },

  addNote: (note) => set({ notes: [note, ...get().notes] }),
  updateNoteContent: (id, content) =>
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, content } : n)) }),
  removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) })
}))
