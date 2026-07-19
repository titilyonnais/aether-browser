/** Point d'entrée du renderer. */
import '@fontsource-variable/inter'
import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import PermissionPromptRoot from './PermissionPromptRoot'
import PopoverRoot from './PopoverRoot'

// Pas de StrictMode : le double-montage des effets perturberait la
// synchronisation des vues natives (bounds, visibilité) avec le main.
const container = document.getElementById('root')
if (!container) throw new Error('#root introuvable')

// Même bundle pour les fenêtres popup natives (?popover=1, ?permission-prompt=1) :
// voir src/main/popoverWindow.ts/PopoverRoot.tsx et
// src/main/permissionPromptWindow.ts/PermissionPromptRoot.tsx pour le pourquoi.
const params = new URLSearchParams(window.location.search)
if (params.get('popover') === '1') {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  createRoot(container).render(<PopoverRoot />)
} else if (params.get('permission-prompt') === '1') {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  createRoot(container).render(<PermissionPromptRoot />)
} else {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
