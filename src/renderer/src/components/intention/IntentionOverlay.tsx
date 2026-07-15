/**
 * Barre d'Intention — le point d'entrée unique d'ÆTHER.
 * URL, recherche ou intention en langage naturel : la classification
 * heuristique répond instantanément, l'IA raffine en arrière-plan.
 * Des suggestions apparaissent au fil de la frappe — pages ouvertes,
 * favoris, historique et commandes rapides — comme la barre d'adresse de
 * Chrome, mais alimentées par la mémoire propre à ÆTHER.
 * ⏎ exécuter · ⇧⏎ carte sur la toile · Ctrl⏎ forcer la recherche · ↑↓ suggestions.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Globe, Search, Sparkles, Star, Wand2, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { heuristicClassify } from '@shared/intent'
import type { Favorite, IntentResult, PageMeta, Visit } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { Kbd } from '@/components/ui/Kbd'
import { useT } from '@/i18n/useT'
import type { TFunction } from '@/i18n/useT'
import { executeIntent, focusPage, museAsk, openFavoriteUrl } from '@/lib/actions'
import { cn, domainOf } from '@/lib/utils'
import { useFavoritesStore } from '@/stores/favorites'
import { usePagesStore } from '@/stores/pages'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

export function IntentionOverlay() {
  const open = useUiStore((s) => s.overlay === 'intention')
  return <AnimatePresence>{open && <IntentionPanel />}</AnimatePresence>
}

interface Suggestion {
  id: string
  kind: 'open' | 'favorite' | 'history' | 'command'
  title: string
  subtitle: string
  faviconUrl: string | null
  run: () => void
}

type QuickCommandId = 'summarize' | 'compare' | 'translate' | 'explain'

const QUICK_COMMANDS: { keywords: string[]; id: QuickCommandId }[] = [
  { keywords: ['résume', 'resume', 'résumer'], id: 'summarize' },
  { keywords: ['compare', 'comparer', 'vs'], id: 'compare' },
  { keywords: ['traduis', 'traduire', 'translate'], id: 'translate' },
  { keywords: ['explique', 'expliquer'], id: 'explain' }
]

const QUICK_COMMAND_LABEL_KEY: Record<QuickCommandId, string> = {
  summarize: 'overlays.intention.commandSummarize',
  compare: 'overlays.intention.commandCompare',
  translate: 'overlays.intention.commandTranslate',
  explain: 'overlays.intention.commandExplain'
}

function IntentionPanel() {
  const t = useT()
  const prefill = useUiStore((s) => s.intentionPrefill)
  const pendingCanvasPos = useUiStore((s) => s.pendingCanvasPos)
  const mode = useUiStore((s) => s.mode)
  const pagesMap = usePagesStore((s) => s.pages)
  const favorites = useFavoritesStore((s) => s.favorites)
  const activeSpaceId = useSpacesStore((s) => s.activeSpaceId)

  const [input, setInput] = useState(prefill)
  const [aiResult, setAiResult] = useState<IntentResult | null>(null)
  const [selection, setSelection] = useState(-1)
  const [history, setHistory] = useState<Visit[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestSeq = useRef(0)
  const historySeq = useRef(0)

  const close = (): void => useUiStore.getState().closeOverlay()

  // Texte pré-sélectionné à l'ouverture — comme la barre d'adresse de tout
  // navigateur : taper remplace immédiatement l'URL/le texte pré-rempli.
  useEffect(() => {
    inputRef.current?.select()
  }, [])

  // Classification instantanée (heuristique locale).
  const heuristic = useMemo(
    () => (input.trim() ? heuristicClassify(input) : null),
    [input]
  )
  const result = aiResult && aiResult.input === input.trim() ? aiResult : heuristic

  // Raffinement IA débouncé — n'écrase jamais une saisie plus récente.
  useEffect(() => {
    setAiResult(null)
    const value = input.trim()
    if (value.length < 15 || !/\s/.test(value)) return
    const seq = ++requestSeq.current
    const timer = setTimeout(() => {
      void window.aether.intent.classify(value).then((r) => {
        if (requestSeq.current === seq && r.source === 'ai') setAiResult(r)
      })
    }, 380)
    return () => clearTimeout(timer)
  }, [input])

  // Historique de navigation — recherche débouncée côté main (table dédiée).
  useEffect(() => {
    const q = input.trim()
    if (q.length < 2) {
      setHistory([])
      return
    }
    const seq = ++historySeq.current
    const timer = setTimeout(() => {
      void window.aether.history.search(q, 4).then((r) => {
        if (historySeq.current === seq) setHistory(r)
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [input])

  // Suggestions « sur l'appareil » : pages ouvertes + favoris correspondants.
  const { openMatches, favoriteMatches } = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (q.length < 2) return { openMatches: [] as PageMeta[], favoriteMatches: [] as Favorite[] }
    const favoriteUrls = new Set(favorites.map((f) => f.url))
    const all = Object.values(pagesMap).filter(
      (p) => p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
    )
    const bySpace = (a: PageMeta, b: PageMeta): number => {
      const aActive = a.spaceId === activeSpaceId ? 1 : 0
      const bActive = b.spaceId === activeSpaceId ? 1 : 0
      return bActive - aActive || b.lastVisitedAt - a.lastVisitedAt
    }
    const matchingFavorites = favorites.filter(
      (f) => f.title.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)
    )
    return {
      openMatches: all.filter((p) => !favoriteUrls.has(p.url)).sort(bySpace).slice(0, 3),
      favoriteMatches: matchingFavorites.slice(0, 3)
    }
  }, [input, pagesMap, favorites, activeSpaceId])

  const quickCommands = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (q.length < 2) return []
    return QUICK_COMMANDS.filter((c) => c.keywords.some((k) => q.includes(k))).slice(0, 2)
  }, [input])

  const suggestions: Suggestion[] = useMemo(() => {
    const out: Suggestion[] = []
    for (const p of openMatches) {
      out.push({
        id: `open-${p.id}`,
        kind: 'open',
        title: p.title || domainOf(p.url),
        subtitle: domainOf(p.url),
        faviconUrl: p.faviconUrl,
        run: () => focusPage(p.id)
      })
    }
    for (const f of favoriteMatches) {
      out.push({
        id: `fav-${f.id}`,
        kind: 'favorite',
        title: f.title || domainOf(f.url),
        subtitle: domainOf(f.url),
        faviconUrl: f.faviconUrl,
        run: () => void openFavoriteUrl(f.url)
      })
    }
    for (const v of history) {
      if (openMatches.some((p) => p.url === v.url) || favoriteMatches.some((p) => p.url === v.url)) continue
      out.push({
        id: `hist-${v.id}`,
        kind: 'history',
        title: v.title || domainOf(v.url),
        subtitle: domainOf(v.url),
        faviconUrl: v.faviconUrl,
        run: () => void executeIntent({ input: v.url, type: 'url', url: v.url, source: 'heuristic' })
      })
    }
    for (const c of quickCommands) {
      out.push({
        id: `cmd-${c.id}`,
        kind: 'command',
        title: t(QUICK_COMMAND_LABEL_KEY[c.id]),
        subtitle: t('overlays.intention.commandHint'),
        faviconUrl: null,
        run: () => museAsk(input.trim(), { open: true })
      })
    }
    return out.slice(0, 8)
  }, [openMatches, favoriteMatches, history, quickCommands, input, t])

  useEffect(() => setSelection(-1), [input])

  const execute = (forceSearch: boolean, asCard: boolean): void => {
    if (!result) return
    const final: IntentResult = forceSearch
      ? { input: result.input, type: 'search', query: result.input, source: 'heuristic' }
      : result
    // Depuis la toile (double-clic ou mode canvas), l'ouverture reste une carte.
    const target = asCard || pendingCanvasPos !== null || (mode === 'canvas' && final.type !== 'intent')
      ? ('card' as const)
      : ('focus' as const)
    close()
    void executeIntent(final, { target, canvasPos: pendingCanvasPos })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelection((s) => Math.min(s + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelection((s) => Math.max(s - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selection >= 0 && suggestions[selection]) {
        close()
        suggestions[selection].run()
      } else if (input.trim()) {
        execute(e.ctrlKey || e.metaKey, e.shiftKey)
      }
    }
  }

  const kindIcon: Record<Suggestion['kind'], typeof Star> = {
    open: Globe,
    favorite: Star,
    history: Clock,
    command: Zap
  }
  const kindLabel: Record<Suggestion['kind'], string> = {
    open: t('overlays.intention.kindOpen'),
    favorite: t('overlays.intention.kindFavorite'),
    history: t('overlays.intention.kindHistory'),
    command: t('overlays.intention.kindCommand')
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
        initial={{ opacity: 0, y: -14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="glass-strong fixed left-1/2 top-[16vh] z-50 w-[min(660px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl"
      >
        {/* Champ principal */}
        <div className="flex h-[62px] items-center gap-3.5 px-5">
          <Sparkles size={17} strokeWidth={1.6} className="shrink-0 text-glacier/80" />
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('overlays.intention.placeholder')}
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-light text-ink outline-none placeholder:text-ink-faint"
          />
          <Kbd>{t('overlays.intention.keyEscape')}</Kbd>
        </div>

        {/* Interprétation */}
        {result && (
          <button
            type="button"
            onClick={() => execute(false, false)}
            className={cn(
              'flex w-full items-center gap-3.5 border-t border-white/[0.06] px-5 py-3.5 text-left transition-colors',
              selection === -1 ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
              {result.type === 'url' ? (
                <Globe size={14} strokeWidth={1.6} className="text-glacier" />
              ) : result.type === 'search' ? (
                <Search size={14} strokeWidth={1.6} className="text-ink-dim" />
              ) : (
                <Wand2 size={14} strokeWidth={1.6} className="text-lavande" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink">{describeIntent(result, t)}</span>
              <span className="block truncate text-[11px] text-ink-faint">
                {describeIntentDetail(result, t)}
              </span>
            </span>
            {result.source === 'ai' && (
              <span className="shrink-0 rounded-md border border-lavande/25 px-1.5 py-0.5 text-[9.5px] font-medium tracking-wide text-lavande">
                {t('overlays.intention.aiBadge')}
              </span>
            )}
            <Kbd>⏎</Kbd>
          </button>
        )}

        {/* Suggestions : pages ouvertes, favoris, historique, commandes rapides */}
        {suggestions.length > 0 && (
          <div className="max-h-64 overflow-y-auto border-t border-white/[0.06] py-1.5">
            {suggestions.map((s, i) => {
              const Icon = kindIcon[s.kind]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    close()
                    s.run()
                  }}
                  onMouseEnter={() => setSelection(i)}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors',
                    selection === i ? 'bg-white/[0.05]' : ''
                  )}
                >
                  {s.kind === 'command' ? (
                    <Icon size={13} strokeWidth={1.7} className="shrink-0 text-ink-faint" />
                  ) : (
                    <Favicon url={s.subtitle} faviconUrl={s.faviconUrl} size={15} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim">{s.title}</span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    <Icon size={10} strokeWidth={1.8} className="text-ink-faint/70" />
                    <span className="font-mono text-[9.5px] text-ink-faint">{kindLabel[s.kind]}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Aide-mémoire */}
        <div className="flex items-center gap-5 border-t border-white/[0.06] px-5 py-2.5 text-[10.5px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>⏎</Kbd> {t('overlays.intention.hintOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⇧⏎</Kbd> {t('overlays.intention.hintCard')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl⏎</Kbd> {t('overlays.intention.hintForceSearch')}
          </span>
          {suggestions.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd> {t('overlays.intention.hintSuggestions')}
            </span>
          )}
        </div>
      </motion.div>
    </>
  )
}

function describeIntent(r: IntentResult, t: TFunction): string {
  if (r.type === 'url') return t('overlays.intention.navigateTo', { domain: domainOf(r.url ?? r.input) })
  if (r.type === 'search') return t('overlays.intention.searchFor', { query: r.query ?? r.input })
  const plan = r.plan ?? { kind: 'ask' as const }
  if (plan.kind === 'compare') return t('overlays.intention.compareTwo', { left: plan.left, right: plan.right })
  if (plan.kind === 'search-and-ask') return t('overlays.intention.exploreWithMuse', { query: r.query ?? r.input })
  return t('overlays.intention.delegateToMuse')
}

function describeIntentDetail(r: IntentResult, t: TFunction): string {
  if (r.type === 'url') return r.url ?? r.input
  if (r.type === 'search') return t('overlays.intention.searchDetail')
  const plan = r.plan ?? { kind: 'ask' as const }
  if (plan.kind === 'compare') return t('overlays.intention.compareDetail')
  if (plan.kind === 'search-and-ask') return t('overlays.intention.exploreDetail')
  return t('overlays.intention.defaultDetail')
}
