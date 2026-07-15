/**
 * Mode Focus — une ou deux pages en vue scindée (horizontale ou verticale).
 * Le séparateur se saisit ; le ratio et l'orientation sont persistés par
 * espace. Les vues natives suivent le layout via useViewBounds.
 */
import { Compass, LifeBuoy, Orbit } from 'lucide-react'
import { useRef } from 'react'
import { Kbd } from '@/components/ui/Kbd'
import { useT } from '@/i18n/useT'
import { openUrl } from '@/lib/actions'
import { clamp } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'
import { PageSlot } from './PageSlot'
import { PageStrip } from './PageStrip'

export function FocusView() {
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const focus = usePagesStore((s) => (spaceId ? (s.focusBySpace[spaceId] ?? null) : null))
  const showPageStrip = useSettingsStore((s) => s.settings?.showPageStrip ?? false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const slots = focus?.slots ?? []
  const orientation = focus?.orientation ?? 'h'
  const ratio = focus?.ratio ?? 0.5

  if (!spaceId || slots.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {showPageStrip && <PageStrip />}
        <div className="min-h-0 flex-1">
          <VoidState />
        </div>
      </div>
    )
  }

  const setRatio = (r: number): void => {
    usePagesStore.getState().setFocus(spaceId, { ratio: clamp(r, 0.18, 0.82) })
  }

  const onDividerPointerDown = (e: React.PointerEvent): void => {
    const el = containerRef.current
    if (!el) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const move = (ev: PointerEvent): void => {
      const value =
        orientation === 'h'
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height
      setRatio(value)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showPageStrip && <PageStrip />}
      <div
        ref={containerRef}
        className="flex min-h-0 w-full flex-1"
        style={{ flexDirection: orientation === 'h' ? 'row' : 'column' }}
      >
        <div
          style={slots.length === 2 ? { flexBasis: `${ratio * 100}%` } : undefined}
          className={
            slots.length === 2 ? 'min-h-0 min-w-0 flex-shrink flex-grow-0' : 'min-h-0 min-w-0 flex-1'
          }
        >
          <PageSlot pageId={slots[0]} index={0} />
        </div>

        {slots.length === 2 && (
          <>
            <div
              onPointerDown={onDividerPointerDown}
              className="group relative z-10 flex shrink-0 items-center justify-center"
              style={{
                width: orientation === 'h' ? 9 : undefined,
                height: orientation === 'v' ? 9 : undefined,
                margin: orientation === 'h' ? '0 -4px' : '-4px 0',
                cursor: orientation === 'h' ? 'col-resize' : 'row-resize'
              }}
            >
              <div
                className="bg-white/[0.06] transition-colors duration-200 group-hover:bg-glacier/40"
                style={{
                  width: orientation === 'h' ? 1 : '100%',
                  height: orientation === 'v' ? 1 : '100%'
                }}
              />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <PageSlot pageId={slots[1]} index={1} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** État vide — un espace calme qui invite à l'action, avec des points de départ concrets. */
function VoidState() {
  const homepage = useSettingsStore((s) => s.settings?.homepage ?? '')
  const ui = useUiStore.getState()
  const t = useT()

  return (
    <div className="grid h-full place-items-center">
      <div className="flex w-full max-w-md flex-col items-center gap-7 pb-16 text-center">
        <span className="animate-breathe select-none font-display text-[80px] leading-none text-ink-faint/40">
          Æ
        </span>
        <div className="space-y-1.5">
          <p className="font-display text-[20px] italic text-ink-dim">
            {t('focusCanvas.focusView.voidTitle')}
          </p>
          <p className="text-[12.5px] font-light leading-relaxed text-ink-faint">
            {t('focusCanvas.focusView.voidSubtitle')}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={() => ui.openOverlay('intention')}
            className="group flex items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-glacier/40 hover:bg-white/[0.05]"
          >
            <Compass size={16} strokeWidth={1.6} className="shrink-0 text-glacier" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">
                {t('focusCanvas.focusView.expressIntention')}
              </span>
              <span className="block text-[11px] text-ink-faint">
                {t('focusCanvas.focusView.expressIntentionHint')}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          {homepage && (
            <button
              type="button"
              onClick={() => void openUrl(homepage)}
              className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-left text-[12.5px] text-ink-dim transition-colors hover:border-white/[0.14] hover:text-ink"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center text-ink-faint">⌂</span>
              {t('focusCanvas.focusView.openHomepage')}
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => ui.setMode('canvas')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[12px] text-ink-faint transition-colors hover:border-white/[0.14] hover:text-ink-dim"
            >
              <Orbit size={13} strokeWidth={1.7} />
              {t('focusCanvas.focusView.discoverCanvas')}
            </button>
            <button
              type="button"
              onClick={() => ui.openOverlay('guide')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[12px] text-ink-faint transition-colors hover:border-white/[0.14] hover:text-ink-dim"
            >
              <LifeBuoy size={13} strokeWidth={1.7} />
              {t('focusCanvas.focusView.guide')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
