/**
 * Aperçu Gmail — derniers messages de la boîte de réception (lecture seule,
 * via Gmail API). Ne connecte PAS gmail.com dans le navigateur.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Mail, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GmailPreviewMessage } from '@shared/types'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function GmailPreviewOverlay() {
  const open = useUiStore((s) => s.overlay === 'gmail-preview')
  return <AnimatePresence>{open && <GmailPreviewPanel />}</AnimatePresence>
}

function formatReceivedAt(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function GmailPreviewPanel() {
  const t = useT()
  const [messages, setMessages] = useState<GmailPreviewMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.aether.google.gmailPreview()
      .then(setMessages)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) => m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q)
    )
  }, [messages, query])

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
          <Mail size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.gmailPreview.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.gmailPreview.searchPlaceholder')}
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
          placeholder={t('overlays.gmailPreview.searchPlaceholder')}
        />

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
                {messages.length === 0
                  ? t('overlays.gmailPreview.emptyState')
                  : t('overlays.gmailPreview.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    className={
                      m.unread ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-glacier' : 'mt-1.5 h-1.5 w-1.5 shrink-0'
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="fade-truncate text-[11px] text-ink-faint">{m.from}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                        {formatReceivedAt(m.receivedAt)}
                      </span>
                    </span>
                    <span className={m.unread ? 'block fade-truncate text-[12.5px] text-ink' : 'block fade-truncate text-[12.5px] text-ink-dim'}>
                      {m.subject || t('overlays.gmailPreview.noSubject')}
                    </span>
                    <span className="block fade-truncate text-[11px] text-ink-faint">{m.snippet}</span>
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
