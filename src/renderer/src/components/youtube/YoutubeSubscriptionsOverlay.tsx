/**
 * Abonnements YouTube — liste des chaînes suivies + dernière activité connue
 * (upload récent). PAS un historique de visionnage : l'API publique YouTube
 * ne l'expose pas, voir la note affichée dans l'en-tête.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { MonitorPlay, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { YoutubeSubscription } from '@shared/types'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function YoutubeSubscriptionsOverlay() {
  const open = useUiStore((s) => s.overlay === 'youtube-subscriptions')
  return <AnimatePresence>{open && <YoutubeSubscriptionsPanel />}</AnimatePresence>
}

function YoutubeSubscriptionsPanel() {
  const t = useT()
  const [subs, setSubs] = useState<YoutubeSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.aether.google.youtubeSubscriptions()
      .then(setSubs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return subs
    return subs.filter((s) => s.title.toLowerCase().includes(q))
  }, [subs, query])

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
          <MonitorPlay size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.youtubeSubscriptions.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.youtubeSubscriptions.searchPlaceholder')}
            />
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <X size={15} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <SearchBar
          open={searchOpen}
          value={query}
          onChange={setQuery}
          placeholder={t('overlays.youtubeSubscriptions.searchPlaceholder')}
        />

        <p className="shrink-0 border-b border-white/[0.06] px-5 py-2 text-[10.5px] leading-relaxed text-ink-faint">
          {t('overlays.youtubeSubscriptions.notHistoryNote')}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] text-ink-faint">{t('settings.common.loading')}</p>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-red-200">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {subs.length === 0
                  ? t('overlays.youtubeSubscriptions.emptyState')
                  : t('overlays.youtubeSubscriptions.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((sub) => (
                <div
                  key={sub.channelId}
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  {sub.thumbnailUrl ? (
                    <img
                      src={sub.thumbnailUrl}
                      width={32}
                      height={32}
                      draggable={false}
                      className="mt-0.5 shrink-0 rounded-full"
                      alt=""
                    />
                  ) : (
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-white/[0.06]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block fade-truncate text-[12.5px] text-ink-dim">{sub.title}</span>
                    <span className="block fade-truncate text-[10.5px] text-ink-faint">
                      {sub.recentActivityTitle
                        ? t('overlays.youtubeSubscriptions.recentActivity', { title: sub.recentActivityTitle })
                        : t('overlays.youtubeSubscriptions.noRecentActivity')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
