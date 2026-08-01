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
import { POPOVER_SAFETY_PX } from '@shared/popoverGeometry'
import type { ContextMenuRow, LocalRect, PopoverContent } from '@shared/types'
import { disableNativeWindowTransitions } from './dwm'
import { captureAndSendBackdrop } from './popoverBackdrop'
import { fadeWindowIn, fadeWindowOut } from './windowFade'

/**
 * Décrit quel COIN du popup reste FIXE au point d'ancrage — bouton cliqué,
 * ou point de clic droit — lors d'un redimensionnement ultérieur (flyout,
 * contenu asynchrone…) : le popup grandit/rétrécit alors depuis le coin
 * OPPOSÉ, jamais depuis celui-ci. Généralise l'ancien `pinnedRightEdge`
 * (toujours associé à un haut fixe) aux QUATRE combinaisons — nécessaire au
 * retournement du menu contextuel (voir `pinnedAnchorFor`), qui doit pouvoir
 * s'ancrer par n'importe lequel de ses quatre coins selon la place restante
 * près du bord de l'écran, plutôt que de systématiquement partir du
 * haut-gauche et se faire recaler (« aimanté ») par `sanitizeToDisplay` en
 * cas de débordement — le point cliqué n'est alors plus tenu du tout,
 * contrairement à un vrai retournement.
 */
interface PopoverAnchor {
  /** Quel bord horizontal reste sur `point.x`. */
  x: 'left' | 'right'
  /** Quel bord vertical reste sur `point.y`. */
  y: 'top' | 'bottom'
  point: { x: number; y: number }
}

/** Ancrage par défaut : coin haut-gauche au point donné (comportement
 * d'avant l'introduction du retournement — inchangé pour tout appelant qui
 * n'a pas besoin de choisir un autre coin). */
export function topLeftAnchor(point: { x: number; y: number }): PopoverAnchor {
  return { x: 'left', y: 'top', point }
}

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
  /** Coin + point fixés à l'ouverture (`openPopover`, AVANT le clamp de
   * `sanitizeToDisplay`) — sert de base à CHAQUE recalcul dans
   * `resizePopoverWindow`, plutôt que `popup.getBounds()` (qui peut déjà être
   * une valeur clampée par un précédent appel, ex. à cause d'une taille
   * initiale devinée trop grande, ou par un précédent redimensionnement).
   * Sans ce point de référence fixe : (a) un sous-menu qui élargit/agrandit
   * le popup (flyout, voir AppMenuPopoverCard.tsx) perdrait son bord ancré
   * (droit ou bas) à chaque recalcul depuis la taille courante plutôt que
   * depuis ce point fixe — poussant le popup hors écran puis le faisant
   * recaler par `sanitizeToDisplay` en déplaçant TOUT le popup (donc son
   * contenu déjà affiché) au lieu de grandir depuis le coin voulu ; (b) un
   * premier clamp (taille initiale devinée trop grande) ne se déferait
   * jamais une fois la vraie taille, plus petite, mesurée. */
  pinnedAnchor: PopoverAnchor
  /** Point de clic BRUT (coordonnées écran), pour le menu contextuel
   * SEULEMENT (`null` sinon) — son retournement (`pinnedAnchorFor`) dépend de
   * la TAILLE, connue seulement par estimation à l'ouverture (`showContextMenuPopover`,
   * `CONTEXT_MENU_WIDTH`/`HEIGHT`). Un menu réellement plus grand que
   * l'estimation (liste longue, libellé large — plus aucune troncature
   * depuis la 0.76.0) avait décidé « ça tient en dessous » à tort, gardait ce
   * choix figé (comme `pinnedAnchor` pour tout le reste), débordait bel et
   * bien une fois sa vraie taille appliquée, et se faisait recaler en bloc
   * par `sanitizeToDisplay` — la bulle « aimantée » au bord de l'écran,
   * signalé par capture utilisateur. `resizePopoverWindow` RECALCULE donc le
   * retournement à chaque mesure réelle quand ce champ est renseigné, plutôt
   * que de se fier à une décision figée prise sur une estimation. */
  dynamicAnchorPoint: { x: number; y: number } | null
  /** Anti-rebond DÉDIÉ à la capture d'arrière-plan (voir `captureAndSendBackdrop`),
   * DÉCOUPLÉ de `boundsDebounceTimer` : cette capture est une vraie prise
   * d'écran (coût GPU réel, pas gratuit), alors que `boundsDebounceTimer`
   * laisse volontairement passer un appel IMMÉDIAT par rafale pour que la
   * fenêtre suive le contenu sans latence perçue (voir son commentaire).
   * Sans ce découplage, CETTE capture s'exécutait aussi à CHAQUE appel
   * immédiat — plusieurs par seconde pendant l'animation d'un sous-menu
   * (menu principal) — assez pour la faire saccader, signalé par capture
   * utilisateur : seul ce menu enchaîne autant de redimensionnements en
   * rafale. Le flou n'a de toute façon pas besoin d'être temps réel — une
   * capture qui n'attrape que l'état FINAL, une fois la rafale calmée, ne se
   * remarque pas. */
  captureDebounceTimer: ReturnType<typeof setTimeout> | null
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
      pinnedAnchor: topLeftAnchor({ x: 0, y: 0 }),
      dynamicAnchorPoint: null,
      captureDebounceTimer: null
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

function clearCaptureDebounce(s: PopoverState): void {
  if (s.captureDebounceTimer) {
    clearTimeout(s.captureDebounceTimer)
    s.captureDebounceTimer = null
  }
}

/** N'exécute la capture (coûteuse, GPU) qu'une fois les redimensionnements en
 * rafale calmés — voir le commentaire de `captureDebounceTimer`. */
function scheduleBackdropCapture(owner: BW, popup: BW, bounds: Rectangle, s: PopoverState): void {
  clearCaptureDebounce(s)
  s.captureDebounceTimer = setTimeout(() => {
    s.captureDebounceTimer = null
    void captureAndSendBackdrop(owner, popup, bounds, CH.popoverSetBackdrop)
  }, 120)
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
    // `backgroundMaterial: 'acrylic'` a été essayé ici pour un vrai flou natif
    // DWM, puis RETIRÉ : cette fenêtre est délibérément un peu plus GRANDE que
    // la carte visible (marge anti-rognage + largeur réservée pour un flyout
    // qui n'est pas encore ouvert, voir PopoverRoot.tsx) — Windows peint son
    // matériau Acrylic sur TOUT le rectangle de la fenêtre, sans se soucier de
    // ces zones volontairement invisibles côté CSS (`opacity-0`) : la marge
    // réservée devenait un gros bloc flouté visible qui débordait largement de
    // la bulle (confirmé par capture utilisateur). Le flou « juste dans la
    // bulle » doit rester entièrement piloté par Chromium (voir `.popover-surface`,
    // global.css), qui seul respecte le découpage exact de la carte.
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
 * contenu. `anchor` (coin + point écran fixe) est mémorisé pour que
 * `resizePopoverWindow` puisse grandir/rétrécir sans jamais déplacer ce coin.
 * `dynamicAnchorPoint` (menu contextuel seulement, voir son commentaire dans
 * `PopoverState`) fait recalculer ce retournement à CHAQUE mesure réelle
 * plutôt que de figer la décision prise sur une estimation. */
export function openPopover(
  parent: BW,
  bounds: Rectangle,
  content: PopoverContent,
  anchor: PopoverAnchor,
  dynamicAnchorPoint: { x: number; y: number } | null = null
): void {
  const { win, s } = ensurePopup(parent)
  s.pinnedAnchor = anchor
  s.dynamicAnchorPoint = dynamicAnchorPoint
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

// Estimation avant mesure réelle (voir POPOVER_DEFAULT_HEIGHT/WIDTH, ipc.ts,
// pour la même logique) — plutôt généreuse : ces menus n'ont plus de
// troncature de libellé (v0.76.0), une ligne réellement longue («  Ouvrir
// dans une nouvelle fenêtre en navigation privée ») peut dépasser 240px.
const CONTEXT_MENU_WIDTH = 320
const CONTEXT_MENU_DEFAULT_HEIGHT = 160

/**
 * Détermine, pour un point d'ancrage (clic droit) et une taille ESTIMÉE
 * donnés, quels bords doivent rester COLLÉS à ce point plutôt que déborder de
 * l'écran — retournement horizontal et vertical INDÉPENDANTS, jamais un
 * simple recalage post-hoc. C'est la différence avec `sanitizeToDisplay`
 * (qui ne fait QUE ramener une fenêtre déjà positionnée dans l'écran, en la
 * décalant sans se soucier du point cliqué) : ici, quand ça déborde, c'est
 * un AUTRE coin du popup qui se pose exactement sur le point cliqué, jamais
 * un bord de la fenêtre qui reste « aimanté » au bord de l'écran alors que
 * le popup, lui, a dérivé loin du clic — signalé par capture utilisateur.
 */
export function pinnedAnchorFor(point: { x: number; y: number }, size: { width: number; height: number }): PopoverAnchor {
  const display = screen.getDisplayNearestPoint(point)
  const area = display.workArea
  const pinRight = point.x + size.width > area.x + area.width
  const pinBottom = point.y + size.height > area.y + area.height
  return { x: pinRight ? 'right' : 'left', y: pinBottom ? 'bottom' : 'top', point }
}

/** Bornes initiales (avant mesure réelle) correspondant à `anchor`, pour le
 * tout premier `win.setBounds()` d'`openPopover` — recalculées à l'identique
 * par `resizePopoverWindow` une fois la vraie taille connue. */
export function boundsForAnchor(anchor: PopoverAnchor, size: { width: number; height: number }): Rectangle {
  return {
    x: anchor.x === 'right' ? anchor.point.x - size.width : anchor.point.x,
    y: anchor.y === 'bottom' ? anchor.point.y - size.height : anchor.point.y,
    width: size.width,
    height: size.height
  }
}

/** Ouvre la bulle de menu contextuel générique, ancrée au point donné
 * (coordonnées locales à `win` — un clic droit, pas un bouton, donc pas de
 * largeur/hauteur d'ancre à gérer). Remplace `Menu.buildFromTemplate` : une
 * bulle DOM mesure sa vraie taille et se positionne avec précision. Se
 * RETOURNE (voir `pinnedAnchorFor`) plutôt que de systématiquement partir du
 * coin haut-gauche du clic : un clic près du bord droit/bas de l'écran doit
 * ouvrir le menu vers la gauche/le haut, avec le coin cliqué qui reste
 * exactement sous la souris — jamais une bulle qui déborderait puis se
 * ferait recaler en bloc contre le bord de l'écran. */
export function showContextMenuPopover(
  win: BW,
  anchor: LocalRect,
  rows: ContextMenuRow[],
  actions: Record<string, () => void>,
  title?: string
): void {
  stateFor(win).contextMenuActions = actions
  // `getContentBounds()` — voir le commentaire de `computePopoverBounds` (ipc.ts).
  const winBounds = win.getContentBounds()
  const point = { x: winBounds.x + anchor.x, y: winBounds.y + anchor.y + 2 }
  const estimate = { width: CONTEXT_MENU_WIDTH, height: CONTEXT_MENU_DEFAULT_HEIGHT }
  const pinnedAnchor = pinnedAnchorFor(point, estimate)
  // `point` transmis comme ancrage DYNAMIQUE : `resizePopoverWindow`
  // recalculera ce retournement une fois la vraie taille du menu connue,
  // cette estimation pouvant se tromper (liste plus longue que prévu…).
  openPopover(win, boundsForAnchor(pinnedAnchor, estimate), { kind: 'context-menu', rows, title }, pinnedAnchor, point)
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
    clearCaptureDebounce(s)
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
    clearCaptureDebounce(s)
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
  // Anti-rebond à FRONT MONTANT : le tout premier rapport d'une rafale est
  // appliqué IMMÉDIATEMENT, les suivants sont regroupés.
  //
  // Avec un anti-rebond classique (uniquement à front descendant), changer de
  // vue dans une bulle donnait une animation en deux temps : le contenu se
  // remplaçait tout de suite, puis la fenêtre native le rattrapait 60 ms plus
  // tard. Ce décalage se voyait — c'est ce qui rendait l'agrandissement peu
  // fluide. Appliquer d'emblée fait suivre la fenêtre au contenu, tandis que
  // le minuteur continue d'absorber les reflows en cascade (ouverture d'un
  // sous-menu, transition d'opacité…) qu'il servait déjà à regrouper.
  const isFirstOfBurst = s.boundsDebounceTimer === null
  const applyBounds = (): void => {
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
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    // La carte VISIBLE (`.popover-surface`) est plus étroite/basse que cette
    // fenêtre de `POPOVER_SAFETY_PX` (marge anti-rognage ajoutée par CHAQUE
    // popover, voir PopoverRoot.tsx) — pour un bord ancré à DROITE ou en BAS,
    // recaler la fenêtre sur `w`/`h` (pleine taille, marge comprise) plaçait
    // la carte RÉELLE cette marge trop tôt : signalé par capture utilisateur,
    // chaque bulle décalée de son bouton d'exactement cette poignée de
    // pixels. On ancre donc sur la taille RÉELLE de la carte, jamais sur la
    // fenêtre qui l'héberge — l'excédent (`POPOVER_SAFETY_PX`) part du côté
    // OPPOSÉ au coin ancré, où il n'a jamais été visible de toute façon.
    const realW = Math.max(1, w - POPOVER_SAFETY_PX)
    const realH = Math.max(1, h - POPOVER_SAFETY_PX)
    // Menu contextuel SEULEMENT (`dynamicAnchorPoint` non nul) : RECALCULE le
    // retournement sur la taille RÉELLE plutôt que de se fier à la décision
    // figée à l'ouverture (prise sur une estimation) — voir le commentaire de
    // `dynamicAnchorPoint` (PopoverState) pour le bug que ça corrige.
    if (s.dynamicAnchorPoint) {
      s.pinnedAnchor = pinnedAnchorFor(s.dynamicAnchorPoint, { width: realW, height: realH })
    }
    // Coin fixe (`pinnedAnchor`) : recalcule toujours `x`/`y` depuis LUI
    // plutôt que depuis `current` — sans ça, un flyout qui élargit/agrandit
    // le popup pousserait son bord ancré hors écran, et `sanitizeToDisplay`
    // rattraperait en décalant TOUT le popup (donc son contenu déjà affiché)
    // au lieu de grandir en gardant le coin visé fixe.
    const x = s.pinnedAnchor.x === 'right' ? s.pinnedAnchor.point.x - realW : s.pinnedAnchor.point.x
    const y = s.pinnedAnchor.y === 'bottom' ? s.pinnedAnchor.point.y - realH : s.pinnedAnchor.point.y
    const current = popup.getBounds()
    const next = sanitizeToDisplay({ x, y, width: w, height: h })
    // Capture de ce qu'il y a réellement derrière le popup à SA position/
    // taille FINALE — source du flou en CSS de chaque carte (voir
    // popoverBackdrop.ts). Anti-rebond DÉDIÉ (voir `captureDebounceTimer`) :
    // n'attrape que l'état une fois la rafale de redimensionnements calmée,
    // jamais à chaque appel immédiat de cette fonction (coût GPU réel, sans
    // quoi une animation qui enchaîne les reflows — sous-menu du menu
    // principal — saccadait, signalé par capture utilisateur). Jamais
    // attendue avant de révéler le popup — la carte reste opaque, sans flou,
    // tant que cette capture n'est pas arrivée.
    scheduleBackdropCapture(owner, popup, next, s)
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
  }

  clearBoundsDebounce(s)
  if (isFirstOfBurst) applyBounds()
  s.boundsDebounceTimer = setTimeout(() => {
    s.boundsDebounceTimer = null
    applyBounds()
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
