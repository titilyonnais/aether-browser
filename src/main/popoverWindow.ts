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
 */
import { BrowserWindow, screen, type BrowserWindow as BW, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'
import { CH } from '@shared/ipc'
import type { ContextMenuRow, LocalRect, PopoverContent } from '@shared/types'
import { disableNativeWindowTransitions } from './dwm'
import { fadeWindowIn, fadeWindowOut } from './windowFade'

let popup: BW | null = null
let ready = false
/** En attente que le contenu remonte sa taille réelle (`resizePopoverWindow`,
 * via le ResizeObserver du renderer) avant d'afficher la fenêtre. */
let pendingShow = false
/** Filet de sécurité si le contenu ne remonte jamais sa taille (ex. page vide). */
let fallbackShowTimer: ReturnType<typeof setTimeout> | null = null
/** Anti-rebond appliqué à TOUT redimensionnement, pas seulement au premier
 * affichage — voir le commentaire dans `resizePopoverWindow`. Un contenu qui
 * charge ses données de façon asynchrone (favoris d'un dossier, infos de
 * site…) mesure d'abord un état de chargement PUIS se redessine plus grand
 * une fois les vraies données arrivées, déclenchant un DEUXIÈME
 * redimensionnement. Limiter l'anti-rebond au seul premier affichage
 * (ancienne version) ne protégeait PAS le cas — plus fréquent — où la fenêtre
 * est déjà visible et que son contenu change (survol rapide d'un onglet à un
 * autre, changement de sous-menu…) : ce redimensionnement-là appliquait les
 * nouvelles bornes immédiatement, sans filet, d'où un « sursaut » visible
 * perçu comme si la bulle s'ouvrait deux fois. Un seul anti-rebond, appliqué
 * systématiquement, couvre les deux cas. */
let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null

function clearFallbackShow(): void {
  if (fallbackShowTimer) {
    clearTimeout(fallbackShowTimer)
    fallbackShowTimer = null
  }
}

function clearBoundsDebounce(): void {
  if (boundsDebounceTimer) {
    clearTimeout(boundsDebounceTimer)
    boundsDebounceTimer = null
  }
}

function createPopup(parent: BW): BW {
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

  ready = false
  win.webContents.once('did-finish-load', () => {
    ready = true
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}?popover=1`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { popover: '1' } })
  }

  win.on('closed', () => {
    if (popup === win) popup = null
  })

  return win
}

function ensurePopup(parent: BW): BW {
  if (popup && !popup.isDestroyed()) return popup
  popup = createPopup(parent)
  return popup
}

/** Ouvre (ou déplace) le popup aux bornes écran données et lui pousse son contenu. */
export function openPopover(parent: BW, bounds: Rectangle, content: PopoverContent): void {
  const win = ensurePopup(parent)
  win.setBounds(sanitizeToDisplay(bounds))

  const push = (): void => {
    if (!win.isDestroyed()) win.webContents.send(CH.popoverSetContent, content)
  }

  const wasVisible = win.isVisible()
  if (ready) push()
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
    pendingShow = true
    clearFallbackShow()
    fallbackShowTimer = setTimeout(() => {
      fallbackShowTimer = null
      if (pendingShow && !win.isDestroyed()) {
        pendingShow = false
        fadeWindowIn(win)
      }
    }, 500)
  }
}

/** Relaie un évènement au popup s'il existe et est ouvert — pour les données
 * qu'il affiche et qui peuvent changer PENDANT qu'il reste ouvert (ex. la
 * liste des favoris d'un dossier, après une action ailleurs dans l'appli).
 * `send()` (main/ipc.ts) ne cible que la fenêtre principale, jamais ce popup. */
export function broadcastToPopover(channel: string, ...args: unknown[]): void {
  if (popup && !popup.isDestroyed()) popup.webContents.send(channel, ...args)
}

/** Vrai si `wc` est le webContents de CE popup — pour distinguer un appel
 * IPC venant de la fenêtre principale de celui d'un composant qui tourne
 * DANS le popup lui-même (ex. FavoritesFolderPopoverCard), qui n'a pas de
 * coordonnées locales exploitables pour ancrer une AUTRE bulle par-dessus. */
export function isPopoverWebContents(wc: WebContents): boolean {
  return popup !== null && !popup.isDestroyed() && popup.webContents === wc
}

/** Action réelle associée à chaque id de la dernière bulle de menu contextuel
 * ouverte (voir ContextMenuPopoverCard.tsx) — un seul menu contextuel peut
 * être ouvert à la fois, la map est simplement remplacée à chaque appel. */
let contextMenuActions: Record<string, () => void> = {}
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
  contextMenuActions = actions
  const winBounds = win.getBounds()
  openPopover(
    win,
    { x: winBounds.x + anchor.x, y: winBounds.y + anchor.y + 2, width: CONTEXT_MENU_WIDTH, height: CONTEXT_MENU_DEFAULT_HEIGHT },
    { kind: 'context-menu', rows, title }
  )
}

/** Exécute l'action de la ligne `id` du menu contextuel actuellement ouvert,
 * puis referme la bulle — appelé par le handler IPC `CH.contextMenuAction`. */
export function runContextMenuAction(id: string): void {
  contextMenuActions[String(id)]?.()
  hidePopoverWindow()
}

export function hidePopoverWindow(): void {
  pendingShow = false
  clearFallbackShow()
  clearBoundsDebounce()
  if (popup && !popup.isDestroyed()) fadeWindowOut(popup)
}

/** Ajuste la taille (position ancrée en haut-gauche) au contenu réel — c'est
 * aussi le signal « le contenu a fini de se peindre » qui déclenche l'affichage
 * différé d'`openPopover` (voir le commentaire là-bas). Anti-rebond appliqué à
 * CHAQUE appel (pas seulement au premier affichage) : un contenu asynchrone
 * peut redimensionner plusieurs fois de suite (état de chargement, puis
 * vraies données) que la fenêtre soit en train d'apparaître OU déjà visible
 * (contenu qui change pendant qu'elle reste ouverte) — appliquer les bornes
 * immédiatement dans ce second cas provoquait le même sursaut visible. */
export function resizePopoverWindow(width: number, height: number): void {
  if (!popup || popup.isDestroyed()) return
  clearBoundsDebounce()
  boundsDebounceTimer = setTimeout(() => {
    boundsDebounceTimer = null
    if (!popup || popup.isDestroyed()) return
    const current = popup.getBounds()
    popup.setBounds(sanitizeToDisplay({ ...current, width: Math.max(1, width), height: Math.max(1, height) }))
    if (pendingShow) {
      pendingShow = false
      clearFallbackShow()
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
