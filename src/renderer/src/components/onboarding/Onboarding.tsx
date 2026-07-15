/**
 * Onboarding — quatre respirations pour comprendre le paradigme :
 * intention, espaces, toile spatiale, Muse. Fond constellé, ton calme.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Columns2, Orbit, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Kbd } from '@/components/ui/Kbd'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useT } from '@/i18n/useT'
import type { TFunction } from '@/i18n/useT'

const STEPS = [
  {
    key: 'welcome',
    render: (t: TFunction) => (
      <>
        <span className="select-none font-display text-[92px] leading-none text-ink">Æ</span>
        <h1 className="font-display text-[30px] italic leading-tight text-ink">
          {t('guide.onboarding.welcome.title')}
        </h1>
        <p className="max-w-md text-[13.5px] font-light leading-relaxed text-ink-dim">
          {t('guide.onboarding.welcome.introA')}{' '}
          <em className="text-ink not-italic font-normal">
            {t('guide.onboarding.welcome.introEm1')}
          </em>
          {t('guide.onboarding.welcome.introB')}{' '}
          <em className="text-ink not-italic font-normal">
            {t('guide.onboarding.welcome.introEm2')}
          </em>
          {t('guide.onboarding.welcome.introC')}
        </p>
      </>
    )
  },
  {
    key: 'intention',
    render: (t: TFunction) => (
      <>
        <div className="flex h-12 w-full max-w-sm items-center gap-3 rounded-full border border-white/[0.1] bg-white/[0.04] px-5">
          <Sparkles size={14} className="text-glacier/80" />
          <span className="text-[13px] font-light text-ink-faint">
            {t('guide.onboarding.intention.placeholderExample')}
          </span>
        </div>
        <h2 className="font-display text-[26px] italic text-ink">
          {t('guide.onboarding.intention.title')}
        </h2>
        <p className="max-w-md text-[13.5px] font-light leading-relaxed text-ink-dim">
          {t('guide.onboarding.intention.body')}
        </p>
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
          <span className="ml-1.5">{t('guide.onboarding.intention.anytime')}</span>
        </p>
      </>
    )
  },
  {
    key: 'canvas',
    render: (t: TFunction) => (
      <>
        <div className="flex items-center gap-6 text-ink-faint">
          <Columns2 size={26} strokeWidth={1.2} />
          <span className="font-display text-[20px] italic text-ink-faint/60">⟷</span>
          <Orbit size={26} strokeWidth={1.2} />
        </div>
        <h2 className="font-display text-[26px] italic text-ink">
          {t('guide.onboarding.canvas.title')}
        </h2>
        <p className="max-w-md text-[13.5px] font-light leading-relaxed text-ink-dim">
          {t('guide.onboarding.canvas.bodyA')}{' '}
          <span className="text-ink">{t('guide.onboarding.canvas.modeFocus')}</span>{' '}
          {t('guide.onboarding.canvas.bodyB')}{' '}
          <span className="text-ink">{t('guide.onboarding.canvas.modeCanvas')}</span>{' '}
          {t('guide.onboarding.canvas.bodyC')}
        </p>
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <Kbd>Ctrl</Kbd>
          <Kbd>E</Kbd>
          <span className="ml-1.5">{t('guide.onboarding.canvas.toggleHint')}</span>
        </p>
      </>
    )
  },
  {
    key: 'muse',
    render: (t: TFunction) => (
      <>
        <Sparkles size={30} strokeWidth={1.1} className="text-lavande" />
        <h2 className="font-display text-[26px] italic text-ink">
          {t('guide.onboarding.muse.title')}
        </h2>
        <p className="max-w-md text-[13.5px] font-light leading-relaxed text-ink-dim">
          {t('guide.onboarding.muse.bodyA')}{' '}
          <span className="text-ink">{t('guide.onboarding.muse.bodyEm')}</span>
          {t('guide.onboarding.muse.bodyB')}
        </p>
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <Kbd>Ctrl</Kbd>
          <Kbd>J</Kbd>
          <span className="ml-1.5">{t('guide.onboarding.muse.callHint')}</span>
        </p>
      </>
    )
  }
] as const

export function Onboarding() {
  const open = useUiStore((s) => s.overlay === 'onboarding')
  return <AnimatePresence>{open && <OnboardingPanel />}</AnimatePresence>
}

function OnboardingPanel() {
  const t = useT()
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() > 0.8 ? 2 : 1,
        delay: Math.random() * 5
      })),
    []
  )

  const finish = (): void => {
    void useSettingsStore.getState().patch({ onboarded: true })
    useUiStore.getState().closeOverlay()
    // Enchaîne sur les repères pointant les zones réelles de l'interface.
    setTimeout(() => useUiStore.getState().startCoach(), 350)
  }
  const next = (): void => (isLast ? finish() : setStep((s) => s + 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <motion.div
      data-theme="dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      className="fixed inset-0 z-50 bg-void"
    >
      {/* Ciel étoilé */}
      {stars.map((s) => (
        <span
          key={s.id}
          className="animate-twinkle absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(600px 400px at 30% 20%, rgba(169,201,236,0.05), transparent), radial-gradient(700px 500px at 75% 85%, rgba(179,164,230,0.05), transparent)'
        }}
      />

      <button
        type="button"
        onClick={finish}
        className="absolute right-6 top-6 rounded-full px-3.5 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:bg-white/[0.04] hover:text-ink-dim"
      >
        {t('guide.onboarding.skip')}
      </button>

      <div className="relative grid h-full place-items-center px-8">
        <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={STEPS[step].key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-5"
            >
              {STEPS[step].render(t)}
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex flex-col items-center gap-6">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(i)}
                  className={
                    i === step
                      ? 'h-1.5 w-5 rounded-full bg-glacier/80 transition-all'
                      : 'h-1.5 w-1.5 rounded-full bg-white/15 transition-all hover:bg-white/30'
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-glacier px-7 py-2.5 text-[13px] font-medium text-ink-onaccent transition-all hover:bg-glacier/90 hover:shadow-[0_0_30px_rgba(169,201,236,0.25)]"
            >
              {isLast ? t('guide.onboarding.startBtn') : t('guide.onboarding.continueBtn')}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
