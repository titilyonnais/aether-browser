/**
 * Fenêtre native flottante pour les popovers locaux (infos de site, aperçu
 * d'onglet) qui doivent apparaître par-dessus une page vivante.
 *
 * Pourquoi une fenêtre séparée plutôt qu'un élément DOM : une WebContentsView
 * de contenu (vidéo, page web) compose TOUJOURS au-dessus du DOM de l'appli,
 * quel que soit le z-index — impossible d'y superposer un popover HTML sans
 * masquer une partie de la vue (gel plein écran) ou rétrécir ses bornes (un
 * rectangle vide visible à l'endroit rétréci, même sans animation). Une
 * fenêtre enfant distincte, elle, compose au-dessus de tout sans jamais
 * toucher aux bornes de la page — zéro artefact visuel, la page reste 100 %
 * vivante et intacte en dessous.
 *
 * UNE INSTANCE de popup PAR FENÊTRE PROPRIÉTAIRE (`parent`) — avant le
 * support multi-fenêtre, un unique popup partagé par tout le process aurait
 * fait qu'ouvrir un menu contextuel dans une fenêtre referme/déplace celui
 * d'une AUTRE fenêtre restée ouverte ailleurs.
 */
import { BrowserWindow, screen, type BrowserWindow as BW, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'
import { CH } from '@shared/ipc'
import type { ContextMenuRow, LocalRect, PopoverContent } from '@shared/types'
import { disableNativeWindowTransitions } from './dwm'
import { fadeWindowIn, fadeWindowOut } from './windowFade'

interface PopoverState {
  popup: BW | null
  ready: boolean
  /** En attente que le contenu remonte sa taille réelle (`resizePopoverWindow`,
   * via le ResizeObserver du renderer) avant d'afficher la fenêtre. */
  pendingShow: boolean
  /** Filet de sécurité si le contenu ne remonte jamais sa taille (ex. page vide). */
  fallbackShowTimer: ReturnType<typeof setTimeout> | null
  /** Anti-rebond appliqué à TOUT redimensionnement, pas seulement au premier
   * affichage — voir le commentaire dans `resizePopoverWindow`. */
  boundsDebounceTimer: ReturnType<typeof setTimeout> | null
  /** Action réelle associée à chaque id de la dernière bulle de menu
   * contextuel ouverte DANS CETTE fenêtre (voir ContextMenuPopoverCard.tsx). */
  contextMenuActions: Record<string, () => void>
  /** Bord DROIT (écran) auquel ce popover reste collé, s'il a été ouvert avec
   * `placement: 'below-right'` (ex. menu principal, sous le bouton "⋯" en
   * haut-droit) — `null` sinon. Un sous-menu qui élargit le popup (flyout,
   * voir AppMenuPopoverCard.tsx) doit grandir vers la GAUCHE en gardant ce
   * bord fixe, jamais recalculer `x` depuis la largeur courante : sans ça,
   * grandir vers la droite pousse hors écran près du bouton, et
   * `sanitizeToDisplay` rattrape en décalant TOUT le popup (donc le menu
   * racine, déjà affiché) vers la gauche au lieu de garder sa position. */
  pinnedRightEdge: number | null
  /** Position Y écran demandée à l'ouverture (`openPopover`, AVANT le clamp de
   * `sanitizeToDisplay`) — sert de base à CHAQUE recalcul dans
   * `resizePopoverWindow`, plutôt que `popup.getBounds().y` (qui peut déjà
   * être une valeur clampée par un précédent appel, ex. à cause d'une
   * hauteur initiale devinée trop grande). Sans ce point de référence fixe,
   * un premier clamp (guess trop haut) ne se défaisait jamais une fois la
   * vraie taille, plus petite, mesurée : `sanitizeToDisplay` re-clampait la
   * valeur DÉJÀ remontée contre la nouvelle hauteur au lieu de repartir de la
   * position naturelle — le popup restait décalé vers le haut en
   * permanence. */
  naturalY: number
}

const states = new Map<number, PopoverState>()

function stateFor(owner: BW): PopoverState {
  let s = states.get(owner.id)
  if (!s) {
    s = {
      popup: null,
      ready: false,
      pendingShow: false,
      fallbackShowTimer: null,
      boundsDebounceTimer: null,
      contextMenuActions: {},
      pinnedRightEdge: null,
      naturalY: 0
    }
    states.set(owner.id, s)
    owner.on('closed', () => states.delete(owner.id))
  }
  return s
}

function clearFallbackShow(s: PopoverState): void {
  if (s.fallbackShowTimer) {
    clearTimeout(s.fallbackShowTimer)
    s.fallbackShowTimer = null
  }
}

function clearBoundsDebounce(s: PopoverState): void {
  if (s.boundsDebounceTimer) {
    clearTimeout(s.boundsDebounceTimer)
    s.boundsDebounceTimer = null
  }
}

function createPopup(parent: BW, s: PopoverState): BW {
  const win = new BrowserWindow({
    parent,
    frame: false,
    transparent: true,
    hasShadow: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  disableNativeWindowTransitions(win)

  s.ready = false
  win.webContents.once('did-finish-load', () => {
    s.ready = true
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}?popover=1`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { popover: '1' } })
  }

  win.on('closed', () => {
    if (s.popup === win) s.popup = null
  })

  return win
}

function ensurePopup(parent: BW): { win: BW; s: PopoverState } {
  const s = stateFor(parent)
  if (s.popup && !s.popup.isDestroyed()) return { win: s.popup, s }
  s.popup = createPopup(parent, s)
  return { win: s.popup, s }
}

/** Ouvre (ou déplace) le popup aux bornes écran données et lui pousse son
 * contenu. `pinnedRightEdge` (bord droit écran fixe, popovers ouverts en
 * `placement: 'below-right'`) est mémorisé pour que `resizePopoverWindow`
 * puisse y grandir sans jamais déplacer ce bord. */
export function openPopover(
  parent: BW,
  bounds: Rectangle,
  content: PopoverContent,
  pinnedRightEdge: number | null = null
): void {
  const { win, s } = ensurePopup(parent)
  s.pinnedRightEdge = pinnedRightEdge
  s.naturalY = bounds.y
  win.setBounds(sanitizeToDisplay(bounds))

  const push = (): void => {
    if (!win.isDestroyed()) win.webContents.send(CH.popoverSetContent, content)
  }

  const wasVisible = win.isVisible()
  if (s.ready) push()
  else win.webContents.once('did-finish-load', push)

  // On attend le vrai signal que le contenu a fini de se peindre —
  // `resizePopoverWindow`, déclenché par la mesure du renderer une fois le
  // nouveau contenu rendu — avant de révéler la fenêtre EN FONDU
  // (`fadeWindowIn`, windowFade.ts). Le fondu n'est pas qu'un habillage
  // cosmétique ici : une fenêtre encore masquée peut ne composer AUCUN frame
  // tant qu'elle n'est pas montrée, donc attendre plus ou moins longtemps
  // avant `showInactive()` ne garantissait jamais que le contenu réel était
  // peint — d'où la bulle translucide (fenêtre principale visible à travers)
  // qui persistait malgré plusieurs passes de correction du seul TIMING.
  // `fadeWindowIn` montre à opacité 0 (ce qui force Chromium à composer),
  // masquant ainsi les tout premiers frames potentiellement incomplets.
  // `hidePopoverWindow` annule cette attente si l'utilisateur a déjà quitté
  // la zone entre-temps.
  // Ce timer n'est qu'un FILET DE SÉCURITÉ (contenu qui ne mesure jamais rien,
  // ex. page vide) — 500ms laisse largement le temps au vrai signal de
  // gagner la course dans l'immense majorité des cas.
  if (!wasVisible) {
    s.pendingShow = true
    clearFallbackShow(s)
    s.fallbackShowTimer = setTimeout(() => {
      s.fallbackShowTimer = null
      if (s.pendingShow && !win.isDestroyed()) {
        s.pendingShow = false
        fadeWindowIn(win)
      }
    }, 500)
  }
}

/** Relaie un évènement à TOUS les popovers actuellement ouverts (une par
 * fenêtre propriétaire, en pratique presque toujours 0 ou 1 à la fois) — pour
 * les données qu'ils affichent et qui peuvent changer PENDANT qu'ils restent
 * ouverts (ex. la liste des favoris d'un dossier, après une action ailleurs
 * dans l'appli). `send()` (main/ipc.ts) ne cible que la fenêtre principale,
 * jamais un popover. */
export function broadcastToPopover(channel: string, ...args: unknown[]): void {
  for (const s of states.values()) {
    if (s.popup && !s.popup.isDestroyed()) s.popup.webContents.send(channel, ...args)
  }
}

/** Vrai si `wc` est le webContents d'UN popover (peu importe sa fenêtre
 * propriétaire) — pour distinguer un appel IPC venant de la fenêtre
 * principale de celui d'un composant qui tourne DANS un popover lui-même
 * (ex. FavoritesFolderPopoverCard), qui n'a pas de coordonnées locales
 * exploitables pour ancrer une AUTRE bulle par-dessus. */
export function isPopoverWebContents(wc: WebContents): boolean {
  for (const s of states.values()) {
    if (s.popup && !s.popup.isDestroyed() && s.popup.webContents === wc) return true
  }
  return false
}

const CONTEXT_MENU_WIDTH = 240
const CONTEXT_MENU_DEFAULT_HEIGHT = 160

/** Ouvre la bulle de menu contextuel générique, ancrée au point donné
 * (coordonnées locales à `win` — un clic droit, pas un bouton, donc pas de
 * largeur/hauteur d'ancre à gérer). Remplace `Menu.buildFromTemplate` : une
 * bulle DOM mesure sa vraie taille et se positionne avec précision. */
export function showContextMenuPopover(
  win: BW,
  anchor: LocalRect,
  rows: ContextMenuRow[],
  actions: Record<string, () => void>,
  title?: string
): void {
  stateFor(win).contextMenuActions = actions
  const winBounds = win.getBounds()
  openPopover(
    win,
    { x: winBounds.x + anchor.x, y: winBounds.y + anchor.y + 2, width: CONTEXT_MENU_WIDTH, height: CONTEXT_MENU_DEFAULT_HEIGHT },
    { kind: 'context-menu', rows, title }
  )
}

/** Exécute l'action de la ligne `id` du menu contextuel actuellement ouvert
 * DANS LA FENÊTRE propriétaire de `sourceWc` (le webContents du popover qui a
 * émis `CH.contextMenuAction` — on remonte à sa fenêtre parente, puis à
 * l'état de CETTE fenêtre, pas un état global partagé), puis referme la
 * bulle — appelé par le handler IPC `CH.contextMenuAction`. */
export function runContextMenuAction(sourceWc: WebContents, id: string): void {
  const popoverWin = BrowserWindow.fromWebContents(sourceWc)
  const owner = popoverWin?.getParentWindow()
  if (owner) {
    stateFor(owner).contextMenuActions[String(id)]?.()
    hidePopoverWindow(owner)
  }
}

export function hidePopoverWindow(owner?: BW): void {
  if (owner) {
    const s = states.get(owner.id)
    if (!s) return
    s.pendingShow = false
    clearFallbackShow(s)
    clearBoundsDebounce(s)
    if (s.popup && !s.popup.isDestroyed()) fadeWindowOut(s.popup)
    return
  }
  // Pas de fenêtre précisée (ex. `CH.popoverHide`, appelé depuis un contexte
  // qui ne connaît que son propre popover) — ferme tous les popovers ouverts,
  // en pratique 0 ou 1 à la fois.
  for (const s of states.values()) {
    s.pendingShow = false
    clearFallbackShow(s)
    clearBoundsDebounce(s)
    if (s.popup && !s.popup.isDestroyed()) fadeWindowOut(s.popup)
  }
}

/** Ajuste la taille (position ancrée en haut-gauche) au contenu réel — c'est
 * aussi le signal « le contenu a fini de se peindre » qui déclenche l'affichage
 * différé d'`openPopover` (voir le commentaire là-bas). Anti-rebond appliqué à
 * CHAQUE appel (pas seulement au premier affichage) : un contenu asynchrone
 * peut redimensionner plusieurs fois de suite (état de chargement, puis
 * vraies données) que la fenêtre soit en train d'apparaître OU déjà visible
 * (contenu qui change pendant qu'elle reste ouverte) — appliquer les bornes
 * immédiatement dans ce second cas provoquait le même sursaut visible.
 * `sourceWc` : le webContents du popover LUI-MÊME (qui a mesuré sa propre
 * taille) — on remonte à sa fenêtre parente pour trouver le bon état. */
export function resizePopoverWindow(sourceWc: WebContents, width: number, height: number): void {
  const popoverWin = BrowserWindow.fromWebContents(sourceWc)
  const owner = popoverWin?.getParentWindow()
  if (!owner) return
  const s = states.get(owner.id)
  if (!s || !s.popup || s.popup.isDestroyed()) return
  const popup = s.popup
  clearBoundsDebounce(s)
  s.boundsDebounceTimer = setTimeout(() => {
    s.boundsDebounceTimer = null
    if (popup.isDestroyed()) return
    // Popup masqué (déjà fermé) et pas en cours d'affichage différé : ignorer
    // tout redimensionnement TARDIF. Le ResizeObserver du renderer (le contenu
    // reste monté, la fenêtre n'est que masquée entre deux usages) peut émettre
    // un dernier rapport APRÈS la fermeture (reflow résiduel : réinitialisation
    // d'un sous-menu, transition d'opacité…). Appeler `setBounds()` sur une
    // fenêtre masquée peut la RÉAFFICHER sur Windows (`SetWindowPos` réactive la
    // visibilité), ce qui rouvrait tout seul le menu qu'on venait de fermer —
    // exactement le « se ferme puis se rouvre immédiatement ». La prochaine
    // ouverture repositionnera de toute façon la fenêtre via `openPopover`.
    if (!popup.isVisible() && !s.pendingShow) return
    const current = popup.getBounds()
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    // Bord droit fixe (menu principal) : recalcule toujours `x` depuis ce
    // bord plutôt que de garder `current.x` — sans ça, un flyout qui élargit
    // le popup pousse son bord droit hors écran, et `sanitizeToDisplay`
    // rattrape en décalant tout le popup (donc le panneau déjà affiché)
    // vers la gauche au lieu de grandir en gardant sa position d'origine.
    const x = s.pinnedRightEdge !== null ? s.pinnedRightEdge - w : current.x
    // `y: s.naturalY` (pas `current.y`) : repart TOUJOURS de la position
    // idéale d'origine plutôt que de la valeur déjà affichée — voir le
    // commentaire sur `naturalY` (PopoverState) pour pourquoi `current.y`
    // laissait un clamp initial se figer au lieu de se corriger.
    const next = sanitizeToDisplay({ ...current, x, y: s.naturalY, width: w, height: h })
    // Le ResizeObserver du renderer (PopoverRoot.tsx) se redéclenche à CHAQUE
    // reflow (ex. ouvrir/fermer un sous-menu change `opacity`/`inert`, ce qui
    // recalcule le layout même quand les dimensions FINALES ne bougent pas
    // d'un pixel) — sans cette garde, `setBounds()` était rappelé avec des
    // bornes strictement IDENTIQUES, et Windows recompose quand même toute la
    // fenêtre transparente à chaque appel, même sans changement réel : un
    // scintillement visible pour rien. On ignore un appel qui ne changerait
    // concrètement rien.
    if (
      next.x === current.x &&
      next.y === current.y &&
      next.width === current.width &&
      next.height === current.height
    ) {
      if (s.pendingShow) {
        s.pendingShow = false
        clearFallbackShow(s)
        fadeWindowIn(popup)
      }
      return
    }
    popup.setBounds(next)
    if (s.pendingShow) {
      s.pendingShow = false
      clearFallbackShow(s)
      fadeWindowIn(popup)
    }
  }, 60)
}

/** Garde le popup dans les limites de l'écran qui contient le point d'ancrage. */
function sanitizeToDisplay(bounds: Rectangle): Rectangle {
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}
