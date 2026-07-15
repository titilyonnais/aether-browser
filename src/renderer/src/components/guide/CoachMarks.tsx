/**
 * Repères d'accueil — pointent, une fois après l'onboarding, les quatre zones
 * réelles à l'écran. Séquence pas-à-pas, calme, avec une flèche vers chaque
 * région. Se déclenche via ui.startCoach() (fin de l'onboarding) et masque les
 * vues web natives le temps de la visite (via le drapeau coachActive dans App).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useUiStore } from '@/stores/ui'
import { useT } from '@/i18n/useT'

interface Mark {
  titleKey: string
  textKey: string
  /** Position de la bulle, en styles absolus. */
  box: React.CSSProperties
  /** Direction de la flèche depuis la bulle vers la zone. */
  arrow: 'up' | 'down' | 'left' | 'right'
}

const MARKS: Mark[] = [
  {
    titleKey: 'guide.coachMarks.marks.intent.title',
    textKey: 'guide.coachMarks.marks.intent.text',
    box: { top: 56, left: '50%', transform: 'translateX(-50%)' },
    arrow: 'up'
  },
  {
    titleKey: 'guide.coachMarks.marks.constellation.title',
    textKey: 'guide.coachMarks.marks.constellation.text',
    box: { top: 96, left: 300 },
    arrow: 'left'
  },
  {
    titleKey: 'guide.coachMarks.marks.focusCanvas.title',
    textKey: 'guide.coachMarks.marks.focusCanvas.text',
    box: { top: 56, right: 96 },
    arrow: 'up'
  },
  {
    titleKey: 'guide.coachMarks.marks.muse.title',
    textKey: 'guide.coachMarks.marks.muse.text',
    box: { top: 128, right: 364 },
    arrow: 'right'
  }
]

export function CoachMarks() {
  const active = useUiStore((s) => s.coachActive)
  return <AnimatePresence>{active && <CoachSequence />}</AnimatePresence>
}

function CoachSequence() {
  const t = useT()
  const [step, setStep] = useState(0)
  const mark = MARKS[step]
  const isLast = step === MARKS.length - 1

  const finish = (): void => useUiStore.getState().endCoach()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) finish()
        else setStep((s) => s + 1)
      } else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLast])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55]"
    >
      {/* Voile léger : on garde les zones lisibles dessous. */}
      <div className="absolute inset-0 bg-void/45 backdrop-blur-[1px]" onClick={finish} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          style={mark.box}
          className="glass-strong absolute z-10 w-[290px] rounded-2xl p-4"
        >
          <Arrow dir={mark.arrow} />
          <p className="text-[13px] font-medium text-glacier">{t(mark.titleKey)}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{t(mark.textKey)}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1.5">
              {MARKS.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === step
                      ? 'h-1.5 w-4 rounded-full bg-glacier/80 transition-all'
                      : 'h-1.5 w-1.5 rounded-full bg-white/15 transition-all'
                  }
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={finish}
                className="text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
              >
                {t('guide.coachMarks.skip')}
              </button>
              <button
                type="button"
                onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
                className="rounded-full bg-glacier px-4 py-1.5 text-[11.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier/90"
              >
                {isLast ? t('guide.coachMarks.finish') : t('guide.coachMarks.next')}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

/** Petite flèche pulsée qui pointe de la bulle vers la zone concernée. */
function Arrow({ dir }: { dir: Mark['arrow'] }) {
  const base = 'absolute h-2.5 w-2.5 rotate-45 border-glacier/40 bg-veil'
  const pos: Record<Mark['arrow'], string> = {
    up: 'left-1/2 -top-1.5 -translate-x-1/2 border-l border-t',
    down: 'left-1/2 -bottom-1.5 -translate-x-1/2 border-r border-b',
    left: 'top-6 -left-1.5 border-l border-b',
    right: 'top-6 -right-1.5 border-r border-t'
  }
  return (
    <span
      className={`${base} ${pos[dir]}`}
      style={{ boxShadow: '0 0 14px rgba(169,201,236,0.35)' }}
    />
  )
}
