/**
 * Invite de permission (caméra/micro, localisation, notifications) — fenêtre
 * native flottante SÉPARÉE du système de popover partagé (popoverWindow.ts),
 * délibérément : `onPageFocused` (viewManager.ts → ipc.ts) ferme
 * INCONDITIONNELLEMENT le popover partagé dès qu'une page capte le focus, ce
 * qui serait activement faux ici — l'utilisateur doit pouvoir cliquer/lire la
 * page pendant qu'il réfléchit, sans que l'invite disparaisse. Le popover
 * partagé n'a aussi qu'UN contenu actif à la fois par fenêtre, alors qu'une
 * invite de permission doit pouvoir coexister avec le menu principal, un
 * popover de site, etc. Même raisonnement déjà appliqué pour justifier
 * `extensionPopupWindow.ts` comme fenêtre séparée — ici, cycle de vie
 * différent (obligation de TOUJOURS résoudre un callback Electron en
 * attente), pas seulement sémantique de focus différente.
 *
 * `focusable: false` (pas `true` comme extensionPopupWindow.ts, qui héberge
 * un vrai formulaire natif) : cette invite n'a que deux boutons, et rester
 * non focusable renforce le comportement voulu — l'utilisateur garde le focus
 * sur la page pendant qu'elle reste affichée par-dessus.
 *
 * File d'attente FIFO PAR FENÊTRE PROPRIÉTAIRE : plusieurs demandes
 * simultanées (même page demandant 2 permissions, ou 2 pages différentes)
 * s'affichent une à la fois plutôt que de s'écraser.
 */
import { BrowserWindow, screen, type BrowserWindow as BW, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { CH } from '@shared/ipc'
import type { ProfileId, SitePermissionKind } from '@shared/types'
import { sitePermissionsRepo } from './db/repositories'
import { disableNativeWindowTransitions } from './dwm'
import { fadeWindowIn, fadeWindowOut } from './windowFade'

interface PendingRequest {
  id: string
  profileId: ProfileId
  origin: string
  kind: SitePermissionKind
  resolve: (granted: boolean) => void
  /** Retire les écouteurs posés sur la `WebContents` demandeuse (destruction,
   * navigation) — appelé dès que la demande est tranchée, quelle qu'en soit
   * la raison, pour ne jamais laisser un écouteur orphelin. */
  detach: () => void
}

interface PromptState {
  popup: BW | null
  queue: PendingRequest[]
  fallbackShowTimer: ReturnType<typeof setTimeout> | null
}

const states = new Map<number, PromptState>()

function stateFor(owner: BW): PromptState {
  let s = states.get(owner.id)
  if (!s) {
    s = { popup: null, queue: [], fallbackShowTimer: null }
    states.set(owner.id, s)
    owner.on('closed', () => {
      // Fenêtre propriétaire fermée avec des demandes encore en attente : les
      // résoudre TOUTES comme refusées avant de nettoyer — sinon leur
      // callback Electron reste indéfiniment non résolu (un vrai blocage, pas
      // juste un résidu visuel).
      const current = states.get(owner.id)
      if (current) {
        for (const req of current.queue) {
          req.detach()
          req.resolve(false)
        }
      }
      states.delete(owner.id)
    })
  }
  return s
}

function clearFallbackShow(s: PromptState): void {
  if (s.fallbackShowTimer) {
    clearTimeout(s.fallbackShowTimer)
    s.fallbackShowTimer = null
  }
}

/** Garde la fenêtre dans les limites de l'écran qui contient le point d'ancrage. */
function sanitizeToDisplay(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y })
  const area = display.workArea
  return {
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - height))
  }
}

const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 110
/** Décalage fixe depuis le coin haut-gauche de la fenêtre propriétaire : pas
 * d'élément d'ancrage par page dans la chrome actuelle (la pilule d'intention
 * de TitleBar.tsx est unique par FENÊTRE, pas par onglet) — inutile d'ajouter
 * un aller-retour IPC pour demander « où est ton icône » au renderer pour un
 * gain de précision marginal. `44` = hauteur de la barre de titre custom
 * (`h-11`, TitleBar.tsx), pour ne jamais la chevaucher. */
const ANCHOR_OFFSET = { x: 16, y: 44 }

function createPopup(owner: BW): BW {
  const win = new BrowserWindow({
    parent: owner,
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
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}?permission-prompt=1`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { 'permission-prompt': '1' } })
  }
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      const s = states.get(owner.id)
      if (s?.queue[0]) cancelRequest(owner, s.queue[0].id)
    }
  })
  return win
}

/** Affiche (ou remplace le contenu de) la fenêtre pour la demande en tête de
 * file. Bornes de repli (`DEFAULT_WIDTH`/`HEIGHT`) posées avant tout rendu —
 * le filet de sécurité (`fallbackShowTimer`) peut faire apparaître la fenêtre
 * à cette taille si le vrai contenu ne se mesure jamais. */
function showNext(owner: BW, s: PromptState): void {
  clearFallbackShow(s)
  const req = s.queue[0]
  if (!req) {
    if (s.popup && !s.popup.isDestroyed() && s.popup.isVisible()) fadeWindowOut(s.popup)
    return
  }
  if (!s.popup || s.popup.isDestroyed()) s.popup = createPopup(owner)
  const win = s.popup

  const ownerBounds = owner.getBounds()
  const { x, y } = sanitizeToDisplay(
    ownerBounds.x + ANCHOR_OFFSET.x,
    ownerBounds.y + ANCHOR_OFFSET.y,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT
  )
  const current = win.getBounds()
  win.setBounds({ x, y, width: current.width || DEFAULT_WIDTH, height: current.height || DEFAULT_HEIGHT })

  const push = (): void => {
    if (win.isDestroyed()) return
    win.webContents.send(CH.permissionPromptSetContent, { requestId: req.id, origin: req.origin, kind: req.kind })
  }
  if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', push)
  else push()

  s.fallbackShowTimer = setTimeout(() => {
    s.fallbackShowTimer = null
    if (!win.isDestroyed() && !win.isVisible()) fadeWindowIn(win)
  }, 500)
}

/** Résout la demande `requestId` comme refusée SANS persister (redemande la
 * prochaine fois — mêmes sémantiques que Chrome pour une invite ignorée), et
 * enchaîne sur la suivante en file s'il y en a une. Appelé par Échap, une
 * navigation de la page demandeuse, ou sa fermeture. */
function cancelRequest(owner: BW, requestId: string): void {
  const s = states.get(owner.id)
  if (!s) return
  const idx = s.queue.findIndex((r) => r.id === requestId)
  if (idx === -1) return
  const [req] = s.queue.splice(idx, 1)
  req.detach()
  req.resolve(false)
  if (idx === 0) showNext(owner, s)
}

/** Point d'entrée appelé par `webSession.ts` — ne JAMAIS résoudre autrement
 * qu'en appelant cette promesse à `true`/`false` : c'est ce qui débloque le
 * `callback` Electron d'origine, en attente côté Chromium. */
export function requestPermissionPrompt(
  owner: BW,
  profileId: ProfileId,
  origin: string,
  kind: SitePermissionKind,
  requestingWc: WebContents
): Promise<boolean> {
  return new Promise((resolve) => {
    const s = stateFor(owner)
    const id = randomUUID()

    const onDestroyed = (): void => cancelRequest(owner, id)
    const onNavigate = (details: { isMainFrame: boolean }): void => {
      if (details.isMainFrame) cancelRequest(owner, id)
    }
    requestingWc.once('destroyed', onDestroyed)
    requestingWc.on('did-start-navigation', onNavigate)

    const req: PendingRequest = {
      id,
      profileId,
      origin,
      kind,
      resolve,
      detach: () => {
        if (!requestingWc.isDestroyed()) {
          requestingWc.removeListener('destroyed', onDestroyed)
          requestingWc.removeListener('did-start-navigation', onNavigate)
        }
      }
    }
    s.queue.push(req)
    if (s.queue.length === 1) showNext(owner, s)
  })
}

/** Rapporté par le renderer de l'invite une fois son contenu réel mesuré
 * (même mécanisme que `resizePopoverWindow`/`resizeExtensionPopup`). */
export function resizePermissionPrompt(sourceWc: WebContents, width: number, height: number): void {
  const popupWin = BrowserWindow.fromWebContents(sourceWc)
  const owner = popupWin?.getParentWindow()
  if (!owner) return
  const s = states.get(owner.id)
  if (!s || !s.popup || s.popup.isDestroyed()) return
  const ownerBounds = owner.getBounds()
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const { x, y } = sanitizeToDisplay(ownerBounds.x + ANCHOR_OFFSET.x, ownerBounds.y + ANCHOR_OFFSET.y, w, h)
  s.popup.setBounds({ x, y, width: w, height: h })
  clearFallbackShow(s)
  if (!s.popup.isVisible()) fadeWindowIn(s.popup)
}

/** Réponse explicite de l'utilisateur (Autoriser/Bloquer) — persiste TOUJOURS
 * le choix (contrairement à `cancelRequest`), puis enchaîne sur la suivante. */
export function respondPermissionPrompt(sourceWc: WebContents, requestId: string, granted: boolean): void {
  const popupWin = BrowserWindow.fromWebContents(sourceWc)
  const owner = popupWin?.getParentWindow()
  if (!owner) return
  const s = states.get(owner.id)
  if (!s) return
  const idx = s.queue.findIndex((r) => r.id === requestId)
  if (idx === -1) return
  const [req] = s.queue.splice(idx, 1)
  req.detach()
  sitePermissionsRepo.set(req.profileId, req.origin, req.kind, granted ? 'allow' : 'block')
  req.resolve(granted)
  if (idx === 0) showNext(owner, s)
}
