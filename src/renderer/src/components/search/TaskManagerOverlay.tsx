/**
 * Gestionnaire de tâches — façon Chrome (Maj+Échap) : liste des pages ouvertes
 * avec leur mémoire de travail, tous espaces confondus. Rafraîchi en direct
 * tant que le panneau reste ouvert.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Gauge, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { closePage } from '@/lib/actions'
import { domainOf, formatBytes } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useUiStore } from '@/stores/ui'

export function TaskManagerOverlay() {
  const open = useUiStore((s) => s.overlay === 'task-manager')
  return <AnimatePresence>{open && <TaskManagerPanel />}</AnimatePresence>
}

function TaskManagerPanel() {
  const t = useT()
  const pagesMap = usePagesStore((s) => s.pages)
  const pages = Object.values(pagesMap).sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
  const [memory, setMemory] = useState<Record<string, number | null>>({})
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    let cancelled = false
    const refresh = (): void => {
      void Promise.all(
        pages.map(async (p) => [p.id, await window.aether.pages.getMemoryKB(p.id)] as const)
      ).then((entries) => {
        if (cancelled) return
        setMemory(Object.fromEntries(entries))
      })
    }
    refresh()
    const interval = setInterval(refresh, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesMap])

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
          <Gauge size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.taskManager.title')}</p>
          <button
            type="button"
            onClick={close}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={15} strokeWidth={1.7} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {pages.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] text-ink-faint">{t('overlays.taskManager.emptyState')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-ink-faint/70">
                <span className="min-w-0 flex-1">{t('overlays.taskManager.pageColumn')}</span>
                <span className="w-20 shrink-0 text-right">{t('overlays.taskManager.memoryColumn')}</span>
                <span className="w-7 shrink-0" />
              </div>
              {pages.map((p) => {
                const kb = memory[p.id]
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <Favicon url={p.url} faviconUrl={p.faviconUrl} size={13} />
                    <span className="min-w-0 flex-1">
                      <span className="block fade-truncate text-[12px] text-ink-dim">
                        {p.title || domainOf(p.url)}
                      </span>
                      <span className="block fade-truncate font-mono text-[10px] text-ink-faint">
                        {domainOf(p.url)}
                      </span>
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
                      {kb != null ? formatBytes(kb * 1024) : p.isLive ? '…' : '—'}
                    </span>
                    <button
                      type="button"
                      title={t('overlays.taskManager.closeTabTitle')}
                      onClick={() => void closePage(p.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-red-400/10 hover:text-red-200"
                    >
                      <X size={12} strokeWidth={1.8} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
