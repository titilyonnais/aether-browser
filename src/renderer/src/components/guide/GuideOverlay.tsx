/**
 * Guide — référence calme, réouvrable à tout moment (F1 ou « ? »).
 * Explique chaque zone, les gestes et les raccourcis, et expose les pages
 * internes du moteur Chromium réellement disponibles. C'est le filet de
 * sécurité qui rend le paradigme d'ÆTHER compréhensible sans le diluer.
 */
import { AnimatePresence, motion } from 'framer-motion'
import {
  Columns2,
  Compass,
  MousePointerClick,
  Orbit,
  PanelLeft,
  Sparkles,
  SquareArrowOutUpRight,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CHROMIUM_INTERNAL_PAGES } from '@shared/types'
import { Kbd } from '@/components/ui/Kbd'
import { openUrl } from '@/lib/actions'
import { useUiStore } from '@/stores/ui'
import { useT } from '@/i18n/useT'

export function GuideOverlay() {
  const open = useUiStore((s) => s.overlay === 'guide')
  return <AnimatePresence>{open && <GuidePanel />}</AnimatePresence>
}

interface Zone {
  icon: LucideIcon
  nameKey: string
  roleKey: string
  detailKey: string
}

const ZONES: Zone[] = [
  {
    icon: Compass,
    nameKey: 'guide.guideOverlay.zones.intent.name',
    roleKey: 'guide.guideOverlay.zones.intent.role',
    detailKey: 'guide.guideOverlay.zones.intent.detail'
  },
  {
    icon: PanelLeft,
    nameKey: 'guide.guideOverlay.zones.constellation.name',
    roleKey: 'guide.guideOverlay.zones.constellation.role',
    detailKey: 'guide.guideOverlay.zones.constellation.detail'
  },
  {
    icon: Columns2,
    nameKey: 'guide.guideOverlay.zones.focus.name',
    roleKey: 'guide.guideOverlay.zones.focus.role',
    detailKey: 'guide.guideOverlay.zones.focus.detail'
  },
  {
    icon: Orbit,
    nameKey: 'guide.guideOverlay.zones.canvas.name',
    roleKey: 'guide.guideOverlay.zones.canvas.role',
    detailKey: 'guide.guideOverlay.zones.canvas.detail'
  },
  {
    icon: Sparkles,
    nameKey: 'guide.guideOverlay.zones.muse.name',
    roleKey: 'guide.guideOverlay.zones.muse.role',
    detailKey: 'guide.guideOverlay.zones.muse.detail'
  }
]

const GESTURES: { keys: string; labelKey: string }[] = [
  { keys: 'Ctrl K', labelKey: 'guide.guideOverlay.gestures.openIntent' },
  { keys: 'Ctrl E', labelKey: 'guide.guideOverlay.gestures.toggleFocusCanvas' },
  { keys: 'Ctrl B', labelKey: 'guide.guideOverlay.gestures.toggleConstellation' },
  { keys: 'Ctrl J', labelKey: 'guide.guideOverlay.gestures.toggleMuse' },
  { keys: 'Ctrl W', labelKey: 'guide.guideOverlay.gestures.closeTab' },
  { keys: 'Ctrl R', labelKey: 'guide.guideOverlay.gestures.reload' },
  { keys: 'Alt ← / →', labelKey: 'guide.guideOverlay.gestures.navigate' },
  { keys: 'F1', labelKey: 'guide.guideOverlay.gestures.reopenGuide' }
]

function GuidePanel() {
  const t = useT()
  const close = (): void => useUiStore.getState().closeOverlay()

  const replayOnboarding = (): void => {
    close()
    setTimeout(() => useUiStore.getState().openOverlay('onboarding'), 200)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={close}
        className="fixed inset-0 z-40 bg-void/55 backdrop-blur-[7px]"
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[600px] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        {/* En-tête */}
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <span className="select-none font-display text-[24px] leading-none text-ink">Æ</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] italic text-ink">
              {t('guide.guideOverlay.header.title')}
            </p>
            <p className="text-[11px] text-ink-faint">{t('guide.guideOverlay.header.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={15} strokeWidth={1.7} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Les cinq zones */}
          <div className="space-y-2.5">
            {ZONES.map(({ icon: Icon, nameKey, roleKey, detailKey }) => (
              <div
                key={nameKey}
                className="flex gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-glacier">
                  <Icon size={16} strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13.5px] font-medium text-ink">{t(nameKey)}</span>
                    <span className="text-[11px] text-lavande/80">{t(roleKey)}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{t(detailKey)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Raccourcis */}
          <section className="mt-6">
            <h3 className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <MousePointerClick size={13} strokeWidth={1.7} className="text-ink-faint" />
              {t('guide.guideOverlay.gesturesTitle')}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {GESTURES.map((g) => (
                <div key={g.keys} className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-ink-dim">{t(g.labelKey)}</span>
                  <Kbd>{g.keys}</Kbd>
                </div>
              ))}
            </div>
          </section>

          {/* Pages internes Chromium */}
          <section className="mt-6">
            <h3 className="text-[12px] font-medium text-ink">{t('guide.guideOverlay.chromiumTitle')}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
              {t('guide.guideOverlay.chromium.intro')}{' '}
              <span className="font-mono">chrome://</span>{' '}
              {t('guide.guideOverlay.chromium.middle')}{' '}
              <span className="font-mono">chrome://flags</span>{' '}
              {t('guide.guideOverlay.chromium.or')}{' '}
              <span className="font-mono">chrome://settings</span>{' '}
              {t('guide.guideOverlay.chromium.outro')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHROMIUM_INTERNAL_PAGES.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  title={`${p.url} — ${p.description}`}
                  onClick={() => {
                    close()
                    void openUrl(p.url)
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-ink-dim transition-colors hover:border-glacier/30 hover:text-ink"
                >
                  <SquareArrowOutUpRight size={11} strokeWidth={1.7} className="text-ink-faint" />
                  {p.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-6 py-3">
          <button
            type="button"
            onClick={replayOnboarding}
            className="text-[11.5px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {t('guide.guideOverlay.footer.replay')}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-full bg-glacier px-5 py-1.5 text-[12px] font-medium text-ink-onaccent transition-colors hover:bg-glacier/90"
          >
            {t('guide.guideOverlay.footer.gotIt')}
          </button>
        </footer>
      </motion.div>
    </>
  )
}
