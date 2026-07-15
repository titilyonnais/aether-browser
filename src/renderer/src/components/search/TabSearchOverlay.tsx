/**
 * Recherche dans les onglets — palette filtrable listant toutes les pages
 * ouvertes, tous espaces confondus (façon Ctrl+Maj+A de Chrome).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { focusPage } from '@/lib/actions'
import { cn, domainOf, hueColor } from '@/lib/utils'
import { usePagesStore } from '@/stores/pages'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

export function TabSearchOverlay() {
  const open = useUiStore((s) => s.overlay === 'tab-search')
  return <AnimatePresence>{open && <TabSearchPanel />}</AnimatePresence>
}

function TabSearchPanel() {
  const t = useT()
  const pagesMap = usePagesStore((s) => s.pages)
  const spaces = useSpacesStore((s) => s.spaces)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const q = query.trim().toLowerCase()
  const results = Object.values(pagesMap)
    .filter((p) => {
      if (!q) return true
      const space = spaceById.get(p.spaceId)
      return (
        p.title.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q) ||
        (space?.name.toLowerCase().includes(q) ?? false)
      )
    })
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, 60)

  const openTab = (id: string): void => {
    focusPage(id)
    close()
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(520px,88vh)] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <Search size={14} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('overlays.tabSearch.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={close}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] text-ink-faint">{t('overlays.tabSearch.emptyState')}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((p) => {
                const space = spaceById.get(p.spaceId)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openTab(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <Favicon url={p.url} faviconUrl={p.faviconUrl} size={13} />
                    <span className="min-w-0 flex-1">
                      <span className="block fade-truncate text-[12.5px] text-ink-dim">
                        {p.title || domainOf(p.url)}
                      </span>
                      <span className="block fade-truncate font-mono text-[10px] text-ink-faint">
                        {domainOf(p.url)}
                      </span>
                    </span>
                    {space && (
                      <span
                        className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px]')}
                        style={{ background: hueColor(space.hue, 0.12), color: hueColor(space.hue, 0.95) }}
                      >
                        {space.name}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
