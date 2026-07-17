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
 *
 * UNE INSTANCE par fenêtre propriétaire (`parent`) — même raison que
 * popoverWindow.ts : deux fenêtres ÆTHER ne doivent pas se disputer la même
 * bulle d'extension.
 */
import { BrowserWindow, screen, type BrowserWindow as BW, type WebContents } from 'electron'
import { join } from 'node:path'
import { disableNativeWindowTransitions } from './dwm'
import { fadeWindowIn, fadeWindowOut } from './windowFade'

interface ExtensionPopupState {
  popup: BW | null
  /** Filet de sécurité si l'extension ne rapporte jamais sa taille réelle
   * (page vide, script cassé…) — même principe que popoverWindow.ts. */
  fallbackShowTimer: ReturnType<typeof setTimeout> | null
  /** Point d'ancrage courant (coin haut-droit, écran absolu) — mémorisé pour
   * que `resizeExtensionPopup` reste épinglé au MÊME coin droit en
   * grandissant vers la gauche/le bas. */
  currentAnchor: { rightX: number; topY: number } | null
}

const states = new Map<number, ExtensionPopupState>()

function stateFor(owner: BW): ExtensionPopupState {
  let s = states.get(owner.id)
  if (!s) {
    s = { popup: null, fallbackShowTimer: null, currentAnchor: null }
    states.set(owner.id, s)
    owner.on('closed', () => states.delete(owner.id))
  }
  return s
}

const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 400
const MAX_WIDTH = 800
const MAX_HEIGHT = 600

function clearFallbackShow(s: ExtensionPopupState): void {
  if (s.fallbackShowTimer) {
    clearTimeout(s.fallbackShowTimer)
    s.fallbackShowTimer = null
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

/** Calcule les bornes épinglées au coin haut-droit mémorisé, pour une taille donnée. */
function boundsForAnchor(s: ExtensionPopupState, width: number, height: number): { x: number; y: number } {
  const anchor = s.currentAnchor ?? { rightX: width, topY: 0 }
  return sanitizeToDisplay(anchor.rightX - width, anchor.topY, width, height)
}

/** Destruction immédiate, SANS fondu — utilisée uniquement quand une bulle
 * remplace une autre déjà ouverte DANS LA MÊME FENÊTRE (`openExtensionPopup`
 * ci-dessous) : la nouvelle bulle va de toute façon apparaître en fondu
 * l'instant d'après, faire d'abord disparaître l'ancienne en fondu n'ajouterait
 * que de la latence perçue sans bénéfice visuel. */
function destroyPopupImmediate(s: ExtensionPopupState): void {
  clearFallbackShow(s)
  if (s.popup && !s.popup.isDestroyed()) s.popup.close()
  s.popup = null
  s.currentAnchor = null
}

/** Fermeture normale (perte de focus, Échap, clic ailleurs) — même fondu de
 * fermeture que toutes les autres bulles de l'appli avant la destruction réelle. */
function closePopupWithFade(s: ExtensionPopupState): void {
  const win = s.popup
  clearFallbackShow(s)
  if (!win || win.isDestroyed()) return
  fadeWindowOut(win, () => {
    if (s.popup === win) {
      s.popup = null
      s.currentAnchor = null
    }
    if (!win.isDestroyed()) win.close()
  })
}

/** Ouvre (en remplaçant toute bulle d'extension déjà ouverte DANS CETTE
 * FENÊTRE) la bulle réelle de l'extension `popupUrl`
 * (`chrome-extension://<id>/popup.html`), dans la partition où elle est
 * chargée — toujours ancrée au MÊME coin haut-droit (celui de l'icône
 * puzzle, cf. main/ipc.ts), pas au point de clic : le clic vient de
 * l'intérieur d'une AUTRE fenêtre popup (notre liste d'extensions), dont les
 * coordonnées locales ne veulent rien dire ici et varieraient selon la ligne
 * cliquée si on s'en servait. */
export function openExtensionPopup(
  parent: BW,
  partition: string,
  popupUrl: string,
  anchor: { rightX: number; topY: number }
): void {
  const s = stateFor(parent)
  destroyPopupImmediate(s)
  s.currentAnchor = anchor

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
  s.popup = win
  disableNativeWindowTransitions(win)

  const { x, y } = boundsForAnchor(s, DEFAULT_WIDTH, DEFAULT_HEIGHT)
  win.setBounds({ x, y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  win.on('blur', () => {
    if (s.popup === win) closePopupWithFade(s)
  })
  win.on('closed', () => {
    if (s.popup === win) s.popup = null
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      closePopupWithFade(s)
    }
  })

  // Affichage en fondu (`fadeWindowIn`, windowFade.ts — même délai/animation
  // que toutes les autres bulles) piloté par la taille réelle rapportée
  // (`resizeExtensionPopup`), pas par `ready-to-show` (peindrait la taille par
  // défaut AVANT que le vrai contenu ne soit mesuré — même piège de bulle qui
  // saute de taille déjà rencontré et corrigé pour nos propres popovers, cf.
  // popoverWindow.ts). Ce timer n'est qu'un FILET DE SÉCURITÉ si l'extension
  // ne rapporte jamais rien.
  clearFallbackShow(s)
  s.fallbackShowTimer = setTimeout(() => {
    s.fallbackShowTimer = null
    if (s.popup === win && !win.isDestroyed() && !win.isVisible()) {
      fadeWindowIn(win)
      win.focus()
    }
  }, 600)

  void win.loadURL(popupUrl)
}

/** Rapporté par le preload de la fenêtre de bulle elle-même (voir
 * preload/index.ts, branche `chrome-extension:`) une fois le contenu réel de
 * l'extension mesuré. `sourceWc` : le webContents de la bulle elle-même, pour
 * remonter à sa fenêtre propriétaire. */
export function resizeExtensionPopup(sourceWc: WebContents, width: number, height: number): void {
  const popupWin = BrowserWindow.fromWebContents(sourceWc)
  const owner = popupWin?.getParentWindow()
  if (!owner) return
  const s = states.get(owner.id)
  if (!s || !s.popup || s.popup.isDestroyed()) return
  const w = Math.min(MAX_WIDTH, Math.max(1, width))
  const h = Math.min(MAX_HEIGHT, Math.max(1, height))
  const { x, y } = boundsForAnchor(s, w, h)
  s.popup.setBounds({ x, y, width: w, height: h })
  clearFallbackShow(s)
  if (!s.popup.isVisible()) {
    fadeWindowIn(s.popup)
    s.popup.focus()
  }
}

/** Ferme la bulle d'extension de la fenêtre `owner` — sans argument, ferme
 * TOUTES les bulles d'extension ouvertes (en pratique 0 ou 1 à la fois). */
export function closeExtensionPopup(owner?: BW): void {
  if (owner) {
    const s = states.get(owner.id)
    if (s) closePopupWithFade(s)
    return
  }
  for (const s of states.values()) closePopupWithFade(s)
}
