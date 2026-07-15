/**
 * Historique — page complète (façon chrome://history). Liste les visites,
 * groupées par jour ; cliquer ouvre l'URL en Focus dans l'espace courant.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { History, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Visit } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { openUrl } from '@/lib/actions'
import { cn, domainOf, groupByDay, timeOf } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

type DateFilter = 'all' | 'today' | 'yesterday' | 'week'

function startOfDay(offsetDays: number): number {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function matchesDateFilter(ts: number, filter: DateFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'today') return ts >= startOfDay(0)
  if (filter === 'yesterday') return ts >= startOfDay(1) && ts < startOfDay(0)
  return ts >= startOfDay(7)
}

export function HistoryOverlay() {
  const open = useUiStore((s) => s.overlay === 'history')
  return <AnimatePresence>{open && <HistoryPanel />}</AnimatePresence>
}

const DATE_FILTERS: { id: DateFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'overlays.history.filterAll' },
  { id: 'today', labelKey: 'overlays.history.filterToday' },
  { id: 'yesterday', labelKey: 'overlays.history.filterYesterday' },
  { id: 'week', labelKey: 'overlays.history.filterWeek' }
]

function HistoryPanel() {
  const t = useT()
  const [visits, setVisits] = useState<Visit[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const close = (): void => useUiStore.getState().closeOverlay()

  const load = (): void => {
    void window.aether.history.list(300).then(setVisits)
  }

  useEffect(load, [])

  const clearAll = async (): Promise<void> => {
    await window.aether.history.clear(null)
    setVisits([])
  }

  const openVisit = (url: string): void => {
    void openUrl(url, { target: 'focus' })
    close()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visits.filter((v) => {
      if (!matchesDateFilter(v.visitedAt, dateFilter)) return false
      if (!q) return true
      return v.title.toLowerCase().includes(q) || v.url.toLowerCase().includes(q)
    })
  }, [visits, query, dateFilter])

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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(560px,88vh)] w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <History size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.history.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.history.searchPlaceholder')}
            />
            {visits.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAll()}
                title={t('overlays.history.clearAllTitle')}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-red-400/10 hover:text-red-200"
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <X size={15} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <SearchBar open={searchOpen} value={query} onChange={setQuery} placeholder={t('overlays.history.searchPlaceholder')} />

        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-4 py-2">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setDateFilter(f.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                dateFilter === f.id ? 'bg-glacier/15 text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {visits.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.history.emptyState')}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.history.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupByDay(filtered, (v) => v.visitedAt).map((g) => (
                <div key={g.label}>
                  <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint/70">
                    {g.label}
                  </p>
                  <div className="space-y-0.5">
                    {g.items.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => openVisit(v.url)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="w-10 shrink-0 font-mono text-[10px] text-ink-faint">
                          {timeOf(v.visitedAt)}
                        </span>
                        <Favicon url={v.url} faviconUrl={v.faviconUrl} size={13} />
                        <span className="min-w-0 flex-1 fade-truncate text-[12px] text-ink-dim">
                          {v.title || domainOf(v.url)}
                        </span>
                        <span className="max-w-[30%] shrink-0 fade-truncate font-mono text-[10px] text-ink-faint">
                          {domainOf(v.url)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
