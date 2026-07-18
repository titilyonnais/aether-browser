/**
 * Barre de recherche locale (Ctrl+F) — insérée entre l'en-tête du slot et la
 * zone web : la vue native n'occupe que le rectangle du dessous (`useViewBounds`
 * cible cette zone précisément), donc cette bande DOM n'est jamais recouverte.
 */
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PageId } from '@shared/types'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function FindBar({ pageId }: { pageId: PageId }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ matches: number; active: number }>({ matches: 0, active: 0 })
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Chaque frappe annule/relance `findInPage` avec `findNext: false` (nouvelle
  // session — texte différent à chaque caractère). Sans anti-rebond, taper
  // vite envoie une rafale de sessions qui s'annulent les unes les autres
  // avant que Chromium n'ait fini de rapporter le moindre résultat — le
  // compteur restait bloqué à 0/0 en continu, et seul un Entrée (`findNext:
  // true`, qui NE relance PAS de nouvelle session mais continue la dernière
  // encore en cours) laissait enfin un résultat arriver. Un court délai
  // laisse chaque recherche vraiment se terminer avant la suivante.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    return window.aether.pages.onFindResult((r) => {
      if (r.id !== pageId) return
      setResult({ matches: r.matches, active: r.activeMatchOrdinal })
    })
  }, [pageId])

  const close = (): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    window.aether.pages.stopFindInPage(pageId, 'clearSelection')
    useUiStore.getState().closeFindBar()
  }

  const search = (forward: boolean, findNext: boolean): void => {
    if (!query.trim()) {
      window.aether.pages.stopFindInPage(pageId, 'clearSelection')
      setResult({ matches: 0, active: 0 })
      return
    }
    window.aether.pages.findInPage(pageId, query, { forward, findNext })
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b hairline bg-white/[0.02] px-2.5">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          const value = e.target.value
          setQuery(value)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          if (value.trim()) {
            debounceRef.current = setTimeout(() => {
              window.aether.pages.findInPage(pageId, value, { forward: true, findNext: false })
            }, 150)
          } else {
            window.aether.pages.stopFindInPage(pageId, 'clearSelection')
            setResult({ matches: 0, active: 0 })
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (debounceRef.current) clearTimeout(debounceRef.current)
            search(!e.shiftKey, true)
          }
        }}
        placeholder={t('focusCanvas.findBar.placeholder')}
        className="h-7 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
      />
      {query.trim() !== '' && (
        <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] text-ink-faint">
          {result.matches > 0 ? `${result.active}/${result.matches}` : '0/0'}
        </span>
      )}
      <button
        type="button"
        title={t('focusCanvas.findBar.previous')}
        onClick={() => search(false, true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
      >
        <ChevronUp size={13} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        title={t('focusCanvas.findBar.next')}
        onClick={() => search(true, true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
      >
        <ChevronDown size={13} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        title={t('focusCanvas.findBar.close')}
        onClick={close}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
      >
        <X size={13} strokeWidth={1.8} />
      </button>
    </div>
  )
}
