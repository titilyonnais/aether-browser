/**
 * Racine de l'interface ÆTHER.
 * Layout : TitleBar / (Constellation | Focus ou Toile | Muse) + overlays.
 * Synchronise aussi la visibilité des vues natives avec le mode et les overlays.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SpatialCanvas } from '@/components/canvas/SpatialCanvas'
import { TitleBar } from '@/components/chrome/TitleBar'
import { ConstellationPanel } from '@/components/constellation/ConstellationPanel'
import { FavoritesBar } from '@/components/chrome/FavoritesBar'
import { DownloadsOverlay } from '@/components/downloads/DownloadsOverlay'
import { FavoritesOverlay } from '@/components/favorites/FavoritesOverlay'
import { FocusView } from '@/components/focus/FocusView'
import { PageSlot } from '@/components/focus/PageSlot'
import { CoachMarks } from '@/components/guide/CoachMarks'
import { GuideOverlay } from '@/components/guide/GuideOverlay'
import { HistoryOverlay } from '@/components/history/HistoryOverlay'
import { IntentionOverlay } from '@/components/intention/IntentionOverlay'
import { MusePanel } from '@/components/muse/MusePanel'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { QrCodeOverlay } from '@/components/search/QrCodeOverlay'
import { RenameWindowOverlay } from '@/components/search/RenameWindowOverlay'
import { TabSearchOverlay } from '@/components/search/TabSearchOverlay'
import { TaskManagerOverlay } from '@/components/search/TaskManagerOverlay'
import { SettingsOverlay } from '@/components/settings/SettingsOverlay'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useT } from '@/i18n/useT'
import { holdZoomIndicator, initBridge, releaseZoomIndicator, runCommand } from '@/lib/actions'
import { usePagesStore } from '@/stores/pages'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

const ACCENT_HEX: Record<string, string> = {
  glacier: '#a9c9ec',
  lavande: '#b3a4e6',
  emeraude: '#8fe0c2',
  ambre: '#e6c78f',
  rose: '#e6a4c4'
}

export default function App() {
  const ready = useUiStore((s) => s.ready)
  const mode = useUiStore((s) => s.mode)
  const overlay = useUiStore((s) => s.overlay)
  const coachActive = useUiStore((s) => s.coachActive)
  const fullscreenPageId = useUiStore((s) => s.fullscreenPageId)
  const accent = useSettingsStore((s) => s.settings?.accent ?? 'glacier')
  const accentCustom = useSettingsStore((s) => s.settings?.accentCustom ?? '')
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark')
  const showFavoritesBar = useSettingsStore((s) => s.settings?.showFavoritesBar ?? false)
  const uiScale = useSettingsStore((s) => s.settings?.uiScale ?? 1)
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const focus = usePagesStore((s) => (spaceId ? (s.focusBySpace[spaceId] ?? null) : null))

  useHotkeys()

  useEffect(() => {
    void initBridge()
  }, [])

  // Ferme le popup flottant (voir popoverWindow.ts) sur un clic ailleurs dans
  // la chrome, ou Échap. Les popovers PLUS ANCIENS (menu principal, bulle de
  // dossier de favoris, traduction, infos de site) gèrent déjà ça eux-mêmes,
  // chacun avec son propre état `open` + son propre détecteur de clic
  // extérieur scopé à son bouton. Les menus contextuels génériques (favoris,
  // dossiers, onglets, espaces, page web — voir ContextMenuPopoverCard) sont
  // ouverts en tire-et-oublie, sans aucun état local équivalent : rien
  // n'écoutait un clic ailleurs pour les refermer. `hide()` est sans risque à
  // appeler même quand un AUTRE popover gère déjà sa propre fermeture (chaque
  // composant reste responsable de resynchroniser SON état local via
  // `popover.onClosed`), donc un détecteur global ici comble le trou sans
  // rien casser. Un clic DANS le popup lui-même (fenêtre séparée) n'atteint
  // jamais ces écouteurs, posés sur la fenêtre PRINCIPALE — sans risque de
  // fermer le popup pendant qu'on clique dedans.
  useEffect(() => {
    const onDown = (): void => window.aether.popover.hide()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.aether.popover.hide()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Couleur d'accent : repeint --color-glacier (accent principal de l'interface).
  useEffect(() => {
    const hex = accent === 'custom' && accentCustom ? accentCustom : (ACCENT_HEX[accent] ?? ACCENT_HEX.glacier)
    document.documentElement.style.setProperty('--color-glacier', hex)
  }, [accent, accentCustom])

  // Thème : sombre (défaut), clair, ou suivi du système — voir global.css.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Taille de l'interface ÆTHER elle-même (Réglages › Apparence) — `zoom` sur
  // un wrapper dédié (UiScaleRoot ci-dessous), PAS sur <html>. `zoom` rescale
  // aussi les unités vh/vw de l'élément zoomé lui-même par rapport à la vraie
  // fenêtre : appliqué directement sur la racine, `h-screen` (100vh) devient
  // 100vh × uiScale de pixels réels → débordement en bas si uiScale > 1,
  // rectangle noir non couvert si uiScale < 1. `UiScaleRoot` compense en
  // donnant au wrapper une taille (avant zoom) égale à la fenêtre / uiScale,
  // pour qu'une fois zoomée elle occupe exactement la fenêtre réelle — sans
  // effet sur le contenu des pages web (`WebContentsView` natives à part).
  const rootSize = useUiScaleRootSize(uiScale)

  // Un overlay plein écran (ou les repères d'accueil) recouvre la zone web → masquer les vues.
  // Les popovers locaux (infos de site, aperçu d'onglet, dossiers de favoris) ne passent PAS par
  // ici : ils vivent dans une fenêtre popup native séparée (voir PopoverRoot.tsx), qui garde la
  // page vivante et interactive sans jamais chevaucher son rendu.
  useEffect(() => {
    window.aether.pages.setOverlay(overlay !== null || coachActive)
  }, [overlay, coachActive])

  // Visibilité des vues natives selon le mode et les slots du Focus. En plein
  // écran HTML5, seule la page concernée reste attachée (évite tout conflit de
  // superposition avec l'autre moitié d'une vue scindée pendant la bascule).
  const slotsKey = focus?.slots.join(',') ?? ''
  useEffect(() => {
    const ids = fullscreenPageId
      ? [fullscreenPageId]
      : mode === 'focus' && focus
        ? focus.slots
        : []
    window.aether.pages.setVisible(ids)
  }, [mode, slotsKey, spaceId, fullscreenPageId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <UiScaleRoot uiScale={uiScale} size={rootSize}>
        <div className="grid h-full place-items-center bg-void">
          <span className="animate-breathe select-none font-display text-[72px] text-ink-faint/50">
            Æ
          </span>
        </div>
      </UiScaleRoot>
    )
  }

  // Plein écran HTML5 (vidéo…) : aucune chrome ÆTHER, la page occupe tout l'écran.
  // Le navigateur gère lui-même la sortie (Échap) — Electron émet leave-html-full-screen.
  if (fullscreenPageId) {
    return (
      <UiScaleRoot uiScale={uiScale} size={rootSize}>
        <div className="h-full w-full bg-void">
          <PageSlot pageId={fullscreenPageId} index={0} fullscreen />
        </div>
      </UiScaleRoot>
    )
  }

  return (
    <UiScaleRoot uiScale={uiScale} size={rootSize}>
      <div className="relative flex h-full flex-col overflow-hidden bg-void text-ink">
        <AmbientBackground />
        <TitleBar />
        {showFavoritesBar && <FavoritesBar />}
        <div className="relative z-10 flex min-h-0 flex-1">
          <ConstellationPanel />
          <main className="relative min-w-0 flex-1">
            {mode === 'focus' ? <FocusView /> : <SpatialCanvas />}
          </main>
          <MusePanel />
        </div>

        <IntentionOverlay />
        <SettingsOverlay />
        <GuideOverlay />
        <DownloadsOverlay />
        <FavoritesOverlay />
        <HistoryOverlay />
        <TabSearchOverlay />
        <TaskManagerOverlay />
        <QrCodeOverlay />
        <RenameWindowOverlay />
        <Onboarding />
        <CoachMarks />
        <Toasts />
        <ZoomIndicator />
      </div>
    </UiScaleRoot>
  )
}

/** Calcule la taille (avant zoom) que doit avoir `UiScaleRoot` pour occuper
 * exactement la fenêtre réelle une fois le facteur `zoom` appliqué —
 * recalculée au redimensionnement de la fenêtre et au changement d'échelle. */
function useUiScaleRootSize(uiScale: number): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth / uiScale,
    height: window.innerHeight / uiScale
  }))
  useEffect(() => {
    const update = (): void =>
      setSize({ width: window.innerWidth / uiScale, height: window.innerHeight / uiScale })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [uiScale])
  return size
}

/** Unique élément zoomé de toute l'appli — voir le commentaire sur `rootSize`
 * plus haut pour le pourquoi de la compensation de taille. */
function UiScaleRoot({
  uiScale,
  size,
  children
}: {
  uiScale: number
  size: { width: number; height: number }
  children: ReactNode
}) {
  return (
    <div style={{ zoom: uiScale, width: size.width, height: size.height }} className="overflow-hidden">
      {children}
    </div>
  )
}

/** Lueurs ambiantes très discrètes + grain, sous toute l'interface. */
function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 600px at 12% -10%, rgba(169,201,236,0.05), transparent 60%), radial-gradient(900px 700px at 95% 110%, rgba(179,164,230,0.045), transparent 60%)'
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.016]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  )
}

/** Popup de zoom de la page, affiché brièvement en haut au centre (Ctrl+±/0,
 * Ctrl+molette) — reste ouvert tant que la souris le survole, comme Chrome. */
function ZoomIndicator() {
  const t = useT()
  const percent = useUiStore((s) => s.zoomIndicator)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex justify-center">
      <AnimatePresence>
        {percent !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onMouseEnter={holdZoomIndicator}
            onMouseLeave={releaseZoomIndicator}
            className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-full py-1.5 pl-1.5 pr-2 text-ink-dim"
          >
            <button
              type="button"
              title={t('shell.app.zoomOut')}
              onClick={() => runCommand('zoom-out')}
              className="grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-white/[0.08]"
            >
              <Minus size={12} strokeWidth={2} />
            </button>
            <span className="w-11 text-center font-mono text-[12px] tabular-nums">{percent}%</span>
            <button
              type="button"
              title={t('shell.app.zoomIn')}
              onClick={() => runCommand('zoom-in')}
              className="grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-white/[0.08]"
            >
              <Plus size={12} strokeWidth={2} />
            </button>
            <div className="mx-0.5 h-4 w-px bg-white/[0.08]" />
            <button
              type="button"
              title={t('shell.app.zoomReset')}
              onClick={() => runCommand('zoom-reset')}
              className="grid h-6 w-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink-dim"
            >
              <RotateCcw size={11} strokeWidth={1.8} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Notifications éphémères, en bas au centre. */
function Toasts() {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="glass-strong rounded-full px-4 py-2 text-[12px] text-ink-dim"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
