/**
 * Raccourcis clavier quand l'interface (et non une page web) a le focus.
 * Les mêmes commandes sont relayées par le main quand une page est focus
 * (voir before-input-event dans viewManager).
 */
import { useEffect } from 'react'
import { getActivePageId, runCommand } from '@/lib/actions'
import { useUiStore } from '@/stores/ui'

export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Guide & fermeture d'overlay — indépendants des modificateurs.
      if (e.key === 'F11') {
        e.preventDefault()
        runCommand('fullscreen')
        return
      }
      if (e.key === 'F1') {
        e.preventDefault()
        const ui = useUiStore.getState()
        if (ui.overlay === 'guide') ui.closeOverlay()
        else ui.openOverlay('guide')
        return
      }
      if (e.key === 'Escape') {
        const ui = useUiStore.getState()
        if (ui.overlay !== null) {
          e.preventDefault()
          ui.closeOverlay()
        }
        return
      }

      if (ctrl && e.shiftKey && key === 'n') {
        e.preventDefault()
        runCommand('private-window')
      } else if (ctrl && e.shiftKey && e.key === 'Delete') {
        e.preventDefault()
        runCommand('clear-data')
      } else if (ctrl && e.shiftKey && key === 'a') {
        e.preventDefault()
        runCommand('tab-search')
      } else if (ctrl && key === 'p') {
        e.preventDefault()
        runCommand('print')
      } else if (ctrl && key === 's') {
        e.preventDefault()
        runCommand('save-page')
      } else if (ctrl && key === 'f') {
        e.preventDefault()
        runCommand('find-in-page')
      } else if (ctrl && (key === 'k' || key === 't' || key === 'l')) {
        e.preventDefault()
        runCommand('intention')
      } else if (ctrl && key === 'e') {
        e.preventDefault()
        runCommand('toggle-mode')
      } else if (ctrl && key === 'b') {
        e.preventDefault()
        runCommand('toggle-constellation')
      } else if (ctrl && key === 'j') {
        e.preventDefault()
        runCommand('toggle-muse')
      } else if (ctrl && key === 'w') {
        e.preventDefault()
        runCommand('close-page')
      } else if (ctrl && key === ',') {
        e.preventDefault()
        runCommand('settings')
      } else if ((ctrl && key === 'r') || e.key === 'F5') {
        e.preventDefault()
        const id = getActivePageId()
        if (id) window.aether.pages.reload(id)
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        const id = getActivePageId()
        if (id) window.aether.pages.back(id)
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const id = getActivePageId()
        if (id) window.aether.pages.forward(id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
