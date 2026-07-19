/**
 * Store UI : mode d'affichage, panneaux, overlays, sélection, toasts.
 * État pur — l'orchestration inter-stores vit dans lib/actions.ts.
 */
import { create } from 'zustand'
import type { PageId } from '@shared/types'
import { uuid } from '@/lib/utils'

export type ViewMode = 'focus' | 'canvas'
export type OverlayKind =
  | 'intention'
  | 'settings'
  | 'onboarding'
  | 'guide'
  | 'downloads'
  | 'favorites'
  | 'history'
  | 'tab-search'
  | 'task-manager'
  | 'qr-code'
  | 'rename-window'
  | 'create-profile'
  | 'report-problem'
  | 'certificate'
  | null

interface Toast {
  id: string
  text: string
}

interface UiState {
  ready: boolean
  mode: ViewMode
  constellationOpen: boolean
  museOpen: boolean
  overlay: OverlayKind
  /** Préremplissage de la Barre d'Intention à l'ouverture. */
  intentionPrefill: string
  /** Position monde souhaitée pour la prochaine carte (double-clic toile). */
  pendingCanvasPos: { x: number; y: number } | null
  /** Section de réglages à ouvrir (chrome://settings/<sous-page>, chrome://flags…). */
  settingsSection: string | null
  /** Sélection courante (toile / constellation). */
  selectedPageId: PageId | null
  maximized: boolean
  /** Plein écran natif de la fenêtre (F11) — masque aussi la barre des tâches Windows. */
  windowFullscreen: boolean
  /** Repères d'accueil actifs (juste après l'onboarding). */
  coachActive: boolean
  /** Page actuellement en plein écran HTML5 (vidéo…), ou null. Toute la chrome
   * ÆTHER (Constellation, Muse, TitleBar, bande de pages) se masque le temps que
   * cette page occupe tout l'écran. */
  fullscreenPageId: PageId | null
  /** Un drapeau moteur a changé — invite à relancer ÆTHER. */
  pendingRelaunch: boolean
  toasts: Toast[]
  /** Pourcentage de zoom affiché brièvement (Ctrl+±/0, Ctrl+molette), ou null si masqué. */
  zoomIndicator: number | null
  /** Page dont la barre de recherche locale (Ctrl+F) est ouverte, ou null. */
  findBarPageId: PageId | null
  /** Page ciblée par l'overlay QR code (url + titre), ou null. */
  qrTarget: { url: string; title: string } | null
  /** Page ciblée par l'overlay certificat, ou null — même précédent que
   * `qrTarget` : `openOverlay()` n'a pas de champ pageId dans ses `opts`, un
   * slot dédié reste plus cohérent qu'un bolt-on générique. */
  certificateTargetPageId: PageId | null

  setReady(ready: boolean): void
  startCoach(): void
  endCoach(): void
  setWindowFullscreen(fullscreen: boolean): void
  setFullscreenPageId(id: PageId | null): void
  markPendingRelaunch(): void
  setMode(mode: ViewMode): void
  toggleMode(): void
  toggleConstellation(): void
  toggleMuse(): void
  setMuseOpen(open: boolean): void
  openOverlay(
    kind: Exclude<OverlayKind, null>,
    opts?: { prefill?: string; canvasPos?: { x: number; y: number } | null; section?: string }
  ): void
  closeOverlay(): void
  select(id: PageId | null): void
  setMaximized(maximized: boolean): void
  toast(text: string): void
  dismissToast(id: string): void
  setZoomIndicator(percent: number | null): void
  openFindBar(id: PageId): void
  closeFindBar(): void
  setQrTarget(target: { url: string; title: string } | null): void
  setCertificateTarget(id: PageId | null): void
}

export const useUiStore = create<UiState>()((set, get) => ({
  ready: false,
  mode: 'focus',
  constellationOpen: true,
  museOpen: true,
  overlay: null,
  intentionPrefill: '',
  pendingCanvasPos: null,
  settingsSection: null,
  selectedPageId: null,
  maximized: false,
  windowFullscreen: false,
  coachActive: false,
  fullscreenPageId: null,
  pendingRelaunch: false,
  toasts: [],
  zoomIndicator: null,
  findBarPageId: null,
  qrTarget: null,
  certificateTargetPageId: null,

  setReady: (ready) => set({ ready }),
  startCoach: () => set({ coachActive: true }),
  endCoach: () => set({ coachActive: false }),
  setWindowFullscreen: (windowFullscreen) => set({ windowFullscreen }),
  setFullscreenPageId: (fullscreenPageId) => set({ fullscreenPageId }),
  markPendingRelaunch: () => set({ pendingRelaunch: true }),
  setMode: (mode) => set({ mode }),
  toggleMode: () => set({ mode: get().mode === 'focus' ? 'canvas' : 'focus' }),
  toggleConstellation: () => set({ constellationOpen: !get().constellationOpen }),
  toggleMuse: () => set({ museOpen: !get().museOpen }),
  setMuseOpen: (museOpen) => set({ museOpen }),

  openOverlay: (kind, opts) =>
    set({
      overlay: kind,
      intentionPrefill: opts?.prefill ?? '',
      pendingCanvasPos: opts?.canvasPos ?? null,
      settingsSection: opts?.section ?? null
    }),

  closeOverlay: () =>
    set({ overlay: null, intentionPrefill: '', pendingCanvasPos: null, settingsSection: null }),

  select: (selectedPageId) => set({ selectedPageId }),
  setMaximized: (maximized) => set({ maximized }),

  toast: (text) => {
    const id = uuid()
    set({ toasts: [...get().toasts.slice(-2), { id, text }] })
    setTimeout(() => get().dismissToast(id), 2800)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setZoomIndicator: (zoomIndicator) => set({ zoomIndicator }),

  openFindBar: (id) => set({ findBarPageId: id }),
  closeFindBar: () => set({ findBarPageId: null }),
  setQrTarget: (qrTarget) => set({ qrTarget }),
  setCertificateTarget: (certificateTargetPageId) => set({ certificateTargetPageId })
}))
