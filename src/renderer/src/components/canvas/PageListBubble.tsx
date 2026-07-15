/**
 * Bulle semi-permanente (mode Toile, coin haut-droit) listant toutes les
 * pages de l'espace — repliée par défaut (juste le nombre de pages), cliquer
 * dessus déplie la liste filtrable ; cliquer une page aimante la caméra dessus.
 */
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import type { PageMeta } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { cn, domainOf } from '@/lib/utils'

export function PageListBubble({
  pages,
  selectedId,
  onSelect
}: {
  pages: PageMeta[]
  selectedId: string | null
  onSelect: (page: PageMeta) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  if (pages.length === 0) return null

  const q = query.trim().toLowerCase()
  const filtered = q
    ? pages.filter((p) => p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q))
    : pages

  return (
    <div className="glass-strong absolute right-4 top-4 z-10 flex max-h-[70vh] w-64 flex-col overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <LayoutGrid size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 text-[12px] text-ink-dim">
          {t(
            pages.length === 1
              ? 'focusCanvas.pageListBubble.countOne'
              : 'focusCanvas.pageListBubble.countOther',
            { count: pages.length }
          )}
        </span>
        {open ? (
          <ChevronUp size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
        ) : (
          <ChevronDown size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
        )}
      </button>
      {open && (
        <>
          <div className="shrink-0 px-2.5 pb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('focusCanvas.pageListBubble.filterPlaceholder')}
              className="h-7 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11.5px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
            {filtered.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => onSelect(page)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                  page.id === selectedId
                    ? 'bg-white/[0.07] text-ink'
                    : 'text-ink-faint hover:bg-white/[0.04] hover:text-ink-dim'
                )}
              >
                <Favicon url={page.url} faviconUrl={page.faviconUrl} size={12} />
                <span className="min-w-0 flex-1 fade-truncate text-[11.5px]">
                  {page.title || domainOf(page.url)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-ink-faint">
                {t('focusCanvas.pageListBubble.noMatch')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
