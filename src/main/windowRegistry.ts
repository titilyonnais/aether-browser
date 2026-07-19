/**
 * Registre des fenêtres de contenu ÆTHER (une par fenêtre native ouverte —
 * pas les popovers/popups d'extension, qui sont des fenêtres ENFANT au
 * service d'une fenêtre de contenu, cf. `resolveOwnerWindow`).
 *
 * Avant le support multi-fenêtre, `main/ipc.ts` fermait sur UNE seule
 * `{win, views}` passée une fois à `registerIpc()` — chaque handler y
 * référait directement. Avec plusieurs fenêtres, `ipcMain.handle`/`.on` ne
 * peuvent enregistrer qu'UN SEUL gestionnaire par canal (un deuxième appel
 * lèverait une erreur) : chaque gestionnaire doit désormais résoudre LUI-MÊME
 * à quelle fenêtre appartient l'évènement reçu, via `resolveWindowContext`.
 */
import { BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { PageId, ProfileId } from '@shared/types'
import type { ViewManager } from './viewManager'

export interface WindowContext {
  win: BrowserWindow
  views: ViewManager
}

const contexts = new Map<number, WindowContext>()

/** Appelé une fois par fenêtre de contenu créée (voir `createAppWindow`,
 * main/index.ts) — retiré automatiquement à sa fermeture. */
export function registerWindowContext(ctx: WindowContext): void {
  contexts.set(ctx.win.id, ctx)
  ctx.win.on('closed', () => {
    contexts.delete(ctx.win.id)
  })
}

export function allWindowContexts(): WindowContext[] {
  return Array.from(contexts.values())
}

/** Retrouve la fenêtre de contenu (et l'id de page) propriétaire d'un
 * `WebContents` de PAGE (pas d'un renderer hôte/popover) — aucune API
 * Electron ne fait ce lien pour une page qui est une `WebContentsView` ENFANT.
 * Utilisé par la demande de permission (`webSession.ts`) pour savoir où
 * ancrer son invite depuis un `webContents` de page brut. */
export function ownerContextForPageWebContents(
  wc: WebContents
): { ctx: WindowContext; pageId: PageId } | null {
  for (const ctx of allWindowContexts()) {
    const pageId = ctx.views.pageIdForWebContents(wc)
    if (pageId) return { ctx, pageId }
  }
  return null
}

/** Toutes les fenêtres de contenu dont le profil actif correspond — pour
 * diffuser un évènement PROFIL (favoris, historique, extensions…) à toute
 * fenêtre qui affiche ce même profil, sans toucher celles sur un autre. */
export function windowContextsForProfile(profileId: ProfileId): WindowContext[] {
  return allWindowContexts().filter((ctx) => ctx.views.getActiveProfileId() === profileId)
}

/**
 * Résout la fenêtre de contenu propriétaire d'un évènement IPC. Pour un appel
 * venant du renderer PRINCIPAL d'une fenêtre, `e.sender` EST déjà le
 * webContents racine de cette fenêtre (résolution directe). Pour un appel
 * venant d'un popover/popup d'extension (une fenêtre ENFANT séparée, cf.
 * popoverWindow.ts/extensionPopupWindow.ts), `e.sender` désigne cette fenêtre
 * enfant elle-même — on remonte alors à sa fenêtre PARENTE.
 */
export function resolveWindowContext(e: IpcMainEvent | IpcMainInvokeEvent): WindowContext {
  const senderWin = BrowserWindow.fromWebContents(e.sender)
  if (senderWin) {
    const direct = contexts.get(senderWin.id)
    if (direct) return direct
    const parent = senderWin.getParentWindow()
    if (parent) {
      const viaParent = contexts.get(parent.id)
      if (viaParent) return viaParent
    }
  }
  // Filet : ne devrait jamais arriver en usage normal (une fenêtre de contenu
  // existe toujours avant que son renderer puisse émettre un IPC) — plutôt
  // que de planter tout le process (surtout critique pour les canaux `.on`,
  // fire-and-forget), retombe sur la première fenêtre enregistrée s'il y en a
  // une, sinon lève (les appelants `.handle` la rattrapent proprement).
  const fallback = allWindowContexts()[0]
  if (fallback) return fallback
  throw new Error('Aucune fenêtre de contenu enregistrée pour cet évènement IPC')
}
