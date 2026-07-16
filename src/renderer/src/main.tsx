/** Point d'entrée du renderer. */
import '@fontsource-variable/inter'
import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import PopoverRoot from './PopoverRoot'

// Pas de StrictMode : le double-montage des effets perturberait la
// synchronisation des vues natives (bounds, visibilité) avec le main.
const container = document.getElementById('root')
if (!container) throw new Error('#root introuvable')

// Même bundle pour la fenêtre popup native (?popover=1) : voir
// src/main/popoverWindow.ts et PopoverRoot.tsx pour le pourquoi.
const isPopover = new URLSearchParams(window.location.search).get('popover') === '1'
if (isPopover) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  createRoot(container).render(<PopoverRoot />)
} else {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
