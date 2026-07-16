/**
 * Fenêtre native flottante pour la VRAIE bulle d'une extension (son propre
 * `popup.html`, avec son propre JS/CSS) — façon Chrome/Edge/Brave quand on
 * clique sur l'icône d'une extension. Distincte de `popoverWindow.ts` (nos
 * PROPRES bulles, contenu React interne) : ici la page chargée appartient à
 * l'extension elle-même, dans la partition/session où elle est installée —
 * `session.extensions` d'Electron y injecte alors les bindings `chrome.*`
 * normalement, sans configuration supplémentaire de notre part.
 *
 * Contrairement à nos bulles internes, focusable : c'est une VRAIE UI
 * interactive (boutons, cases, formulaires), pas un simple affichage.
 */
import { BrowserWindow, screen, type BrowserWindow as BW } from 'electron'
import { join } from 'node:path'

let popup: BW | null = null
/** Filet de sécurité si l'extension ne rapporte jamais sa taille réelle
 * (page vide, script cassé…) — même principe que popoverWindow.ts. */
let fallbackShowTimer: ReturnType<typeof setTimeout> | null = null

const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 400
const MAX_WIDTH = 800
const MAX_HEIGHT = 600

function clearFallbackShow(): void {
  if (fallbackShowTimer) {
    clearTimeout(fallbackShowTimer)
    fallbackShowTimer = null
  }
}

/** Garde la bulle dans les limites de l'écran qui contient le point d'ancrage. */
function sanitizeToDisplay(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y })
  const area = display.workArea
  return {
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - height))
  }
}

function destroyPopup(): void {
  clearFallbackShow()
  if (popup && !popup.isDestroyed()) popup.close()
  popup = null
}

/** Ouvre (en remplaçant toute bulle d'extension déjà ouverte) la bulle réelle
 * de l'extension `popupUrl` (`chrome-extension://<id>/popup.html`), dans la
 * partition où elle est chargée — ancrée au point d'ancrage donné (coordonnées
 * ÉCRAN absolues : l'appelant vient toujours de l'intérieur d'une AUTRE fenêtre
 * popup, dont les coordonnées locales ne veulent rien dire ici, cf. le repli
 * déjà en place pour `favoriteShowContextMenu` dans main/ipc.ts). */
export function openExtensionPopup(parent: BW, partition: string, popupUrl: string, anchor: { x: number; y: number }): void {
  destroyPopup()

  const win = new BrowserWindow({
    parent,
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: true,
    backgroundColor: '#ffffff',
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    webPreferences: {
      partition,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  popup = win

  const { x, y } = sanitizeToDisplay(anchor.x, anchor.y, DEFAULT_WIDTH, DEFAULT_HEIGHT)
  win.setBounds({ x, y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  win.on('blur', () => {
    if (popup === win) destroyPopup()
  })
  win.on('closed', () => {
    if (popup === win) popup = null
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      destroyPopup()
    }
  })

  // Affichage piloté par la taille réelle rapportée (`resizeExtensionPopup`),
  // pas par `ready-to-show` (peindrait la taille par défaut AVANT que le vrai
  // contenu ne soit mesuré — même piège de bulle qui saute de taille déjà
  // rencontré et corrigé pour nos propres popovers, cf. popoverWindow.ts).
  // Ce timer n'est qu'un FILET DE SÉCURITÉ si l'extension ne rapporte jamais rien.
  clearFallbackShow()
  fallbackShowTimer = setTimeout(() => {
    fallbackShowTimer = null
    if (popup === win && !win.isDestroyed() && !win.isVisible()) {
      win.showInactive()
      win.focus()
    }
  }, 600)

  void win.loadURL(popupUrl)
}

/** Rapporté par le preload de la fenêtre de bulle elle-même (voir preload/index.ts,
 * branche `chrome-extension:`) une fois le contenu réel de l'extension mesuré. */
export function resizeExtensionPopup(width: number, height: number): void {
  if (!popup || popup.isDestroyed()) return
  const w = Math.min(MAX_WIDTH, Math.max(1, width))
  const h = Math.min(MAX_HEIGHT, Math.max(1, height))
  const current = popup.getBounds()
  const { x, y } = sanitizeToDisplay(current.x, current.y, w, h)
  popup.setBounds({ x, y, width: w, height: h })
  clearFallbackShow()
  if (!popup.isVisible()) {
    popup.showInactive()
    popup.focus()
  }
}

export function closeExtensionPopup(): void {
  destroyPopup()
}
