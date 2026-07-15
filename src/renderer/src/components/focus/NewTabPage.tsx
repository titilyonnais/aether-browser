/**
 * Page de nouvel onglet intégrée (`aether://newtab`) — rendue en composant
 * React normal par PageSlot.tsx, JAMAIS dans une vraie WebContentsView (voir
 * ViewManager.ensureLive, qui saute `loadURL` pour ce schéma). Widgets
 * façon Brave/Chrome : recherche directe, raccourcis éditables, horloge,
 * météo, actualités — tous activables depuis « Personnaliser ».
 * Cliquer un raccourci navigue CET onglet (remplace son contenu), comme un
 * vrai nouvel onglet de navigateur — pas d'ouverture d'une carte en plus.
 */
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sun,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { buildSearchUrl, heuristicClassify, normalizeToUrl } from '@shared/intent'
import type {
  NewTabCitySuggestion,
  NewTabNewsItem,
  NewTabNewsStyle,
  NewTabShortcut,
  NewTabWeather,
  PageId,
  RecentSearch
} from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { closePage, executeIntent } from '@/lib/actions'
import { cn, domainOf, uuid } from '@/lib/utils'
import { useSearchEnginesStore } from '@/stores/searchEngines'
import { useSettingsStore } from '@/stores/settings'

interface NewTabPageProps {
  pageId: PageId
}

const GRID_SIZE_OPTIONS = [5, 10, 15, 20] as const

interface EditState {
  index: number
  title: string
  url: string
}

/** Icône réelle du site via le service public de Google (aucune clé, fiable
 * sans avoir à charger la page) — repli automatique (Favicon) si l'image 404. */
function googleFaviconUrl(url: string): string | null {
  const domain = domainOf(url)
  return domain ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}` : null
}

export function NewTabPage({ pageId }: NewTabPageProps) {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const customEngines = useSearchEnginesStore((s) => s.custom)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [inputFocused, setInputFocused] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const searchRootRef = useRef<HTMLDivElement | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const customizeRootRef = useRef<HTMLDivElement | null>(null)

  const shortcuts = settings?.newTabShortcuts ?? []
  const widgets = settings?.newTabWidgets ?? { clock: true, weather: false, news: false }
  const gridSize = settings?.newTabGridSize ?? 8
  const newsStyle = settings?.newTabNewsStyle ?? 'text'

  const goTo = (url: string): void => {
    window.aether.pages.navigate(pageId, url)
  }

  const submitSearch = (override?: string): void => {
    const value = (override ?? query).trim()
    if (!value) return
    setSuggestions([])
    const result = heuristicClassify(value)
    if (result.type === 'url' && result.url) {
      goTo(result.url)
      return
    }
    if (result.type === 'search') {
      const engine = settings?.searchEngine ?? 'duckduckgo'
      const q = result.query ?? value
      window.aether.newTab.recordSearch(q)
      goTo(buildSearchUrl(engine, q, customEngines))
      return
    }
    // Intention complexe (comparaison, question à Muse…) : le flux complet
    // ouvre ses propres pages/scission — cet onglet vide n'a plus lieu d'être.
    void closePage(pageId)
    void executeIntent(result, { target: 'focus' })
  }

  // Suggestions de recherche (façon barre d'adresse Chrome) — débouncées, dès
  // 1 caractère, sautées quand la saisie ressemble déjà à une URL (pas utile
  // d'y suggérer des requêtes de recherche). API Google, sans clé — voir
  // main/newtab.ts.
  useEffect(() => {
    const value = query.trim()
    if (value.length < 1 || heuristicClassify(value).type === 'url') {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      void window.aether.newTab.searchSuggestions(value).then(setSuggestions)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  // Focus sur un champ vide → dernières RECHERCHES (façon tout navigateur :
  // cliquer la barre avant même de taper propose déjà quelque chose) —
  // DISSOCIÉ de l'historique de navigation : uniquement ce qui a été tapé
  // comme recherche dans ce champ ou la barre d'intention, jamais les pages
  // simplement visitées (lien cliqué, favori ouvert…). On demande plus large
  // que les 8 affichés : le filtre ci-dessous peut en écarter (masquées via
  // la croix) avant d'en garder 8.
  const onFocusSearch = (): void => {
    setInputFocused(true)
    if (query.trim() === '') void window.aether.newTab.recentSearches(20).then(setRecentSearches)
  }

  // Filtre les entrées masquées via la croix (`newTabHiddenRecentIds` — voir
  // removeRecentSearch ci-dessous).
  const cleanRecentSearches = (): RecentSearch[] => {
    const hidden = new Set(settings?.newTabHiddenRecentIds ?? [])
    return recentSearches.filter((s) => !hidden.has(s.id)).slice(0, 8)
  }

  // Masque cette entrée du menu « récents » — un réglage dédié, jamais une
  // suppression réelle (rien à supprimer ici de toute façon : `search_queries`
  // est déjà une table à part, sans lien avec l'historique de navigation).
  const removeRecentSearch = (id: string): void => {
    const hidden = settings?.newTabHiddenRecentIds ?? []
    void useSettingsStore.getState().patch({ newTabHiddenRecentIds: [...hidden, id] })
  }

  const showSuggestions = suggestions.length > 0
  const recentToShow = showSuggestions ? [] : cleanRecentSearches()
  const showRecent = !showSuggestions && inputFocused && query.trim() === '' && recentToShow.length > 0
  const dropdownItems = showSuggestions
    ? suggestions.map((s) => ({
        key: s,
        label: s,
        url: null as string | null,
        faviconUrl: null as string | null,
        onSelect: () => submitSearch(s),
        onRemove: undefined as (() => void) | undefined
      }))
    : showRecent
      ? recentToShow.map((s) => ({
          key: s.id,
          label: s.query,
          url: null as string | null,
          faviconUrl: null as string | null,
          onSelect: () => submitSearch(s.query),
          onRemove: () => removeRecentSearch(s.id)
        }))
      : []

  useEffect(() => setSuggestionIndex(-1), [suggestions, showRecent])

  useEffect(() => {
    if (dropdownItems.length === 0) return
    const onPointerDown = (e: PointerEvent): void => {
      if (searchRootRef.current && !searchRootRef.current.contains(e.target as Node)) {
        setSuggestions([])
        setInputFocused(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdownItems.length])

  // Ferme le panneau « Personnaliser » au clic ailleurs sur l'écran.
  useEffect(() => {
    if (!customizeOpen) return
    const onPointerDown = (e: PointerEvent): void => {
      if (customizeRootRef.current && !customizeRootRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [customizeOpen])

  const startAdd = (): void => setEditing({ index: shortcuts.length, title: '', url: '' })
  const startEdit = (index: number, s: NewTabShortcut): void =>
    setEditing({ index, title: s.title, url: s.url })
  const cancelEdit = (): void => setEditing(null)

  const saveEdit = (): void => {
    if (!editing) return
    const rawUrl = editing.url.trim()
    if (!rawUrl) {
      setEditing(null)
      return
    }
    const url = normalizeToUrl(rawUrl)
    const title = editing.title.trim().slice(0, 60) || domainOf(url)
    const next = [...shortcuts]
    if (editing.index < next.length) {
      next[editing.index] = { ...next[editing.index], title, url }
    } else {
      next.push({ id: uuid(), title, url })
    }
    void useSettingsStore.getState().patch({ newTabShortcuts: next })
    setEditing(null)
  }

  const removeShortcut = (index: number): void => {
    void useSettingsStore.getState().patch({ newTabShortcuts: shortcuts.filter((_, i) => i !== index) })
  }

  const toggleWidget = (key: 'clock' | 'weather' | 'news'): void => {
    void useSettingsStore.getState().patch({ newTabWidgets: { [key]: !widgets[key] } })
  }

  const setGridSize = (size: number): void => {
    void useSettingsStore.getState().patch({ newTabGridSize: size })
  }

  const setNewsStyle = (style: NewTabNewsStyle): void => {
    void useSettingsStore.getState().patch({ newTabNewsStyle: style })
  }

  if (!settings) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto px-6 py-14">
      {widgets.weather && <WeatherWidget />}
      {widgets.clock && <ClockWidget />}

      {/* Recherche — classification instantanée, tape et valide directement ici ;
          suggestions Google façon barre d'adresse Chrome (voir main/newtab.ts). */}
      <div ref={searchRootRef} className="relative mt-6 w-full max-w-lg">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-3.5 focus-within:border-glacier/40">
          <Search size={16} strokeWidth={1.6} className="shrink-0 text-glacier" />
          <input
            // Pas de `autoFocus` : ouvrirait le menu « récents » (onFocus,
            // ci-dessous) tout seul à chaque ouverture de la page, comme si
            // l'utilisateur venait de cliquer dans le champ sans l'avoir fait.
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={onFocusSearch}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && dropdownItems.length > 0) {
                e.preventDefault()
                setSuggestionIndex((i) => Math.min(i + 1, dropdownItems.length - 1))
              } else if (e.key === 'ArrowUp' && dropdownItems.length > 0) {
                e.preventDefault()
                setSuggestionIndex((i) => Math.max(i - 1, -1))
              } else if (e.key === 'Enter') {
                if (suggestionIndex >= 0 && dropdownItems[suggestionIndex]) {
                  dropdownItems[suggestionIndex].onSelect()
                } else {
                  submitSearch()
                }
              } else if (e.key === 'Escape') {
                setSuggestions([])
                setInputFocused(false)
              }
            }}
            placeholder={t('focusCanvas.newTab.searchPlaceholder')}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {dropdownItems.length > 0 && (
          <div className="glass-strong absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl">
            {dropdownItems.map((item, i) => (
              <div
                key={item.key}
                role="option"
                aria-selected={i === suggestionIndex}
                onMouseEnter={() => setSuggestionIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  item.onSelect()
                }}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-3 px-5 py-2 text-left text-[13px] text-ink-dim',
                  i === suggestionIndex && 'bg-white/[0.06] text-ink'
                )}
              >
                {item.url ? (
                  <Favicon url={item.url} faviconUrl={item.faviconUrl} size={14} />
                ) : (
                  <Search size={12} strokeWidth={1.6} className="shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.onRemove && (
                  <button
                    type="button"
                    title={t('focusCanvas.newTab.removeRecent')}
                    onMouseDown={(e) => {
                      // Empêche la sélection de la ligne (le `onMouseDown` du
                      // parent) de se déclencher en plus de la suppression.
                      e.stopPropagation()
                      e.preventDefault()
                      item.onRemove?.()
                    }}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-white/[0.1] hover:text-ink group-hover:opacity-100"
                  >
                    <X size={11} strokeWidth={1.8} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raccourcis — grille éditable façon Brave/Chrome. */}
      <div className="mt-8 grid w-full max-w-lg grid-cols-5 gap-3">
        {Array.from({ length: gridSize }).map((_, i) => {
          const shortcut = shortcuts[i]

          if (editing?.index === i) {
            return (
              <div
                key={`edit-${i}`}
                className="col-span-2 flex flex-col gap-1.5 rounded-xl border border-glacier/40 bg-white/[0.05] p-2.5"
              >
                <input
                  autoFocus
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  onKeyDown={(e) => e.key === 'Escape' && cancelEdit()}
                  placeholder={t('focusCanvas.newTab.shortcutTitlePlaceholder')}
                  className="w-full rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-ink outline-none"
                />
                <input
                  value={editing.url}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit()
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  placeholder={t('focusCanvas.newTab.shortcutUrlPlaceholder')}
                  className="w-full rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-ink outline-none"
                />
                <div className="flex justify-end gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md px-2 py-1 text-[10px] text-ink-faint hover:bg-white/[0.06]"
                  >
                    {t('focusCanvas.newTab.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-glacier/20 px-2 py-1 text-[10px] text-glacier hover:bg-glacier/30"
                  >
                    {t('focusCanvas.newTab.save')}
                  </button>
                </div>
              </div>
            )
          }

          if (shortcut) {
            return (
              <div
                key={shortcut.id}
                className="group relative flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-white/[0.05]"
              >
                <button
                  type="button"
                  onClick={() => goTo(shortcut.url)}
                  title={shortcut.title || domainOf(shortcut.url)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                    <Favicon url={shortcut.url} faviconUrl={googleFaviconUrl(shortcut.url)} size={44} className="h-full w-full" />
                  </span>
                  <span className="w-full max-w-[64px] truncate text-[10.5px] text-ink-faint">
                    {shortcut.title || domainOf(shortcut.url)}
                  </span>
                </button>
                <div className="absolute -top-1 right-0 hidden gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => startEdit(i, shortcut)}
                    title={t('focusCanvas.newTab.editShortcut')}
                    className="grid h-5 w-5 place-items-center rounded-full bg-abyss/95 text-ink-faint hover:text-ink"
                  >
                    <Pencil size={10} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeShortcut(i)}
                    title={t('focusCanvas.newTab.removeShortcut')}
                    className="grid h-5 w-5 place-items-center rounded-full bg-abyss/95 text-ink-faint hover:text-red-300"
                  >
                    <X size={10} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            )
          }

          return (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={startAdd}
              title={t('focusCanvas.newTab.addShortcut')}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-white/[0.05]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-white/[0.12] text-ink-faint/50">
                <Plus size={16} strokeWidth={1.6} />
              </span>
              <span className="text-[10.5px] text-ink-faint/50">{t('focusCanvas.newTab.addShortcut')}</span>
            </button>
          )
        })}
      </div>

      {widgets.news && <NewsWidget style={newsStyle} onOpen={goTo} />}

      {/* `relative` porte UNIQUEMENT le bouton (pas de padding à l'intérieur) :
          `bottom-full` sur le panneau se cale sur le bord de CE conteneur —
          un `pt-10` posé ici décalait le panneau de 40px de trop au-dessus
          du bouton (le padding fait partie de la boîte de référence). */}
      <div ref={customizeRootRef} className="relative mt-auto pb-10">
        <button
          type="button"
          onClick={() => setCustomizeOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] text-ink-faint/60 transition-colors hover:text-ink-faint"
        >
          <SettingsIcon size={11} strokeWidth={1.8} />
          {t('focusCanvas.newTab.customize')}
        </button>

        {customizeOpen && (
          <div className="glass-strong absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-xl p-2">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint/70">
              {t('focusCanvas.newTab.widgetsTitle')}
            </p>
            {(['clock', 'weather', 'news'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleWidget(key)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-dim transition-colors hover:bg-white/[0.05]"
              >
                {t(`focusCanvas.newTab.widget.${key}`)}
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${
                    widgets[key] ? 'border-glacier bg-glacier' : 'border-white/20 bg-transparent'
                  }`}
                />
              </button>
            ))}

            {widgets.news && (
              <div className="mt-1 flex items-center gap-1 border-t border-white/[0.06] px-2 pt-2">
                {(['text', 'photos'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setNewsStyle(style)}
                    className={`flex-1 rounded-md px-2 py-1 text-[10.5px] transition-colors ${
                      newsStyle === style
                        ? 'bg-glacier/20 text-glacier'
                        : 'text-ink-faint hover:bg-white/[0.05]'
                    }`}
                  >
                    {t(`focusCanvas.newTab.newsStyle.${style}`)}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-2 border-t border-white/[0.06] px-2 pt-2 text-[10px] uppercase tracking-wide text-ink-faint/70">
              {t('focusCanvas.newTab.gridSizeTitle')}
            </p>
            <div className="flex items-center gap-1 px-2 pb-1 pt-1">
              {GRID_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setGridSize(size)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                    gridSize === size ? 'bg-glacier/20 text-glacier' : 'text-ink-faint hover:bg-white/[0.05]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClockWidget() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="flex flex-col items-center">
      <span className="font-display text-[40px] leading-none text-ink">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="mt-1 text-[11.5px] capitalize text-ink-faint">
        {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
      </span>
    </div>
  )
}

const WEATHER_ICON: { test: (code: number) => boolean; Icon: typeof Sun }[] = [
  { test: (c) => c === 0, Icon: Sun },
  { test: (c) => c === 1 || c === 2, Icon: CloudSun },
  { test: (c) => c === 3, Icon: Cloud },
  { test: (c) => c === 45 || c === 48, Icon: CloudFog },
  { test: (c) => [51, 53, 55, 56, 57].includes(c), Icon: CloudDrizzle },
  { test: (c) => [61, 63, 65, 66, 67, 80, 81, 82].includes(c), Icon: CloudRain },
  { test: (c) => [71, 73, 75, 77, 85, 86].includes(c), Icon: CloudSnow },
  { test: (c) => [95, 96, 99].includes(c), Icon: CloudLightning }
]

function weatherIcon(code: number): typeof Sun {
  return WEATHER_ICON.find((w) => w.test(code))?.Icon ?? Cloud
}

/** Bulle météo — coin haut-gauche de la page. Cliquer la bulle déplie plus
 * d'infos (ressenti, humidité, vent, UV, lever/coucher) ; une icône dédiée
 * ouvre la localisation (auto/ville). Autonome : lit/écrit directement
 * `newTabWeatherLocation`, pas besoin que le parent lui passe quoi que ce soit. */
function WeatherWidget() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const location = settings?.newTabWeatherLocation ?? null
  const [weather, setWeather] = useState<NewTabWeather | null | undefined>(undefined)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cityDraft, setCityDraft] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<NewTabCitySuggestion[]>([])
  const suppressNextSearch = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Redemande la météo à chaque changement de localisation (auto ↔ ville, ou
  // ville différente) — `location` sert de dépendance même si l'IPC ne le
  // transmet pas explicitement (le main relit le réglage lui-même).
  useEffect(() => {
    let cancelled = false
    void window.aether.newTab.weather().then((w) => {
      if (!cancelled) setWeather(w)
    })
    return () => {
      cancelled = true
    }
  }, [location?.lat, location?.lon])

  // Ferme le picker/le détail au clic extérieur.
  useEffect(() => {
    if (!pickerOpen && !detailsOpen) return
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
        setDetailsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pickerOpen, detailsOpen])

  // Autocomplétion débouncée — le géocodage se fait côté main (pas de clé,
  // limite tout appel superflu pendant que l'utilisateur tape encore).
  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false
      return
    }
    const q = cityDraft.trim()
    if (q.length < 2) {
      setCitySuggestions([])
      return
    }
    const timer = setTimeout(() => {
      void window.aether.newTab.searchCities(q).then(setCitySuggestions)
    }, 250)
    return () => clearTimeout(timer)
  }, [cityDraft])

  const openPicker = (): void => {
    const initial = location?.name ?? ''
    // Montre tout de suite les résultats correspondant à la ville déjà
    // choisie (pas d'attente) : `cityDraft` peut valoir la même chaîne qu'à
    // la dernière ouverture, auquel cas `useState` ne redéclenche PAS l'effet
    // d'autocomplétion ci-dessus (valeur inchangée) — sans cet appel direct,
    // la liste restait vide alors que le texte, lui, s'affichait bien.
    suppressNextSearch.current = true
    setCityDraft(initial)
    setCitySuggestions([])
    if (initial.trim().length >= 2) {
      void window.aether.newTab.searchCities(initial).then(setCitySuggestions)
    }
    setPickerOpen((o) => !o)
  }

  const selectAuto = (): void => {
    void useSettingsStore.getState().patch({ newTabWeatherLocation: null })
    setCityDraft('')
    setCitySuggestions([])
  }

  const selectCitySuggestion = (s: NewTabCitySuggestion): void => {
    suppressNextSearch.current = true
    setCityDraft(s.name)
    setCitySuggestions([])
    void useSettingsStore
      .getState()
      .patch({ newTabWeatherLocation: { name: s.name, admin1: s.admin1, country: s.country, lat: s.lat, lon: s.lon } })
    setPickerOpen(false)
  }

  const locationLabel = location ? [location.name, location.admin1, location.country].filter(Boolean).join(', ') : ''

  return (
    <div ref={rootRef} className="absolute left-5 top-5 z-10 w-[220px]">
      <div className="glass overflow-hidden rounded-2xl border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        >
          {weather ? (
            <>
              {(() => {
                const Icon = weatherIcon(weather.code)
                return <Icon size={22} strokeWidth={1.6} className="shrink-0 text-glacier" />
              })()}
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] leading-none text-ink">
                  {t('focusCanvas.newTab.weatherTemp', { temp: weather.tempC })}
                </span>
                <span className="mt-1 block truncate text-[10.5px] text-ink-faint">
                  {[weather.city, weather.region, weather.country].filter(Boolean).join(', ') ||
                    t('focusCanvas.newTab.weatherModeAuto')}
                </span>
              </span>
            </>
          ) : (
            <span className="text-[11px] text-ink-faint">{t('focusCanvas.newTab.weatherUnavailable')}</span>
          )}
        </button>

        {detailsOpen && weather && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/[0.06] px-4 py-3 text-[10.5px] text-ink-dim">
            {weather.feelsLikeC !== null && (
              <span>{t('focusCanvas.newTab.weatherFeelsLike', { temp: weather.feelsLikeC })}</span>
            )}
            {weather.humidity !== null && (
              <span>{t('focusCanvas.newTab.weatherHumidity', { value: weather.humidity })}</span>
            )}
            {weather.windKph !== null && <span>{t('focusCanvas.newTab.weatherWind', { value: weather.windKph })}</span>}
            {weather.uvIndex !== null && <span>{t('focusCanvas.newTab.weatherUv', { value: weather.uvIndex })}</span>}
            {weather.sunrise && <span>{t('focusCanvas.newTab.weatherSunrise', { time: weather.sunrise })}</span>}
            {weather.sunset && <span>{t('focusCanvas.newTab.weatherSunset', { time: weather.sunset })}</span>}
          </div>
        )}

        {detailsOpen && (
          <button
            type="button"
            onClick={openPicker}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] px-3 py-2 text-[10px] text-ink-faint transition-colors hover:bg-white/[0.04] hover:text-ink-dim"
          >
            <SettingsIcon size={10} strokeWidth={1.8} />
            {t('focusCanvas.newTab.weatherCustomizeLocation')}
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="glass-strong absolute left-0 top-full mt-2 w-64 rounded-xl p-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={selectAuto}
              className={`flex-1 rounded-md px-2 py-1 text-[10.5px] transition-colors ${
                !location ? 'bg-glacier/20 text-glacier' : 'text-ink-faint hover:bg-white/[0.05]'
              }`}
            >
              {t('focusCanvas.newTab.weatherModeAuto')}
            </button>
            <button
              type="button"
              onClick={() => setCityDraft((d) => d || ' ')}
              className={`flex-1 rounded-md px-2 py-1 text-[10.5px] transition-colors ${
                location ? 'bg-glacier/20 text-glacier' : 'text-ink-faint hover:bg-white/[0.05]'
              }`}
            >
              {t('focusCanvas.newTab.weatherModeCity')}
            </button>
          </div>

          {location && (
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-ink-faint">
              {t('focusCanvas.newTab.weatherCurrentCity', { city: locationLabel })}
            </p>
          )}

          {(location || cityDraft) && (
            <>
              <input
                autoFocus
                value={cityDraft.trim() === '' ? '' : cityDraft}
                onChange={(e) => setCityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && citySuggestions[0]) selectCitySuggestion(citySuggestions[0])
                }}
                placeholder={t('focusCanvas.newTab.weatherCityPlaceholder')}
                className="mt-1.5 w-full rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-ink outline-none"
              />
              {citySuggestions.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-white/[0.08]">
                  {citySuggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onMouseDown={(e) => {
                        // Empêche le champ de perdre le focus (voir la même
                        // note dans la 1ère version de ce picker) — évite
                        // qu'un `onBlur` périmé n'écrase la sélection.
                        e.preventDefault()
                        selectCitySuggestion(s)
                      }}
                      className="block w-full truncate px-2 py-1 text-left text-[10.5px] text-ink-dim hover:bg-white/[0.06]"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Mélange (Fisher-Yates) — le bouton « actualiser » pioche un nouveau
 * sous-ensemble du lot fetché (jusqu'à 20 articles), sans dépendre du rythme
 * de publication réel du flux (qui ne change pas forcément entre deux clics). */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function NewsWidget({ style, onOpen }: { style: NewTabNewsStyle; onOpen: (url: string) => void }) {
  const t = useT()
  const [items, setItems] = useState<NewTabNewsItem[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.aether.newTab.news().then((list) => {
      if (!cancelled) setItems(shuffled(list))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = (): void => {
    setRefreshing(true)
    void window.aether.newTab
      .news(true)
      .then((list) => setItems(shuffled(list)))
      .finally(() => setRefreshing(false))
  }

  if (items.length === 0) return null

  const displayItems =
    style === 'photos'
      ? [...items].sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl))).slice(0, 3)
      : items.slice(0, 6)

  return (
    <div className={style === 'photos' ? 'mt-8 w-full max-w-3xl' : 'mt-8 w-full max-w-lg'}>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ink-faint/70">
          <Newspaper size={11} strokeWidth={1.8} />
          {t('focusCanvas.newTab.newsTitle')}
        </p>
        <button
          type="button"
          onClick={refresh}
          title={t('focusCanvas.newTab.newsRefresh')}
          className="grid h-5 w-5 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <RefreshCw size={11} strokeWidth={1.8} className={refreshing ? 'animate-spin' : undefined} />
        </button>
      </div>

      {style === 'photos' ? (
        <div className="grid grid-cols-3 gap-3.5">
          {displayItems.map((item, i) => (
            <button
              key={item.url + i}
              type="button"
              onClick={() => onOpen(item.url)}
              className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] text-left"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                  alt=""
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
              {/* `-webkit-line-clamp` s'est révélé peu fiable ici (le texte
                  débordait quand même, rogné brutalement par le cadre sans
                  points de suspension). Filet de sécurité en deux temps, sur
                  un vrai `<div>` (jamais un `<span>` : un inline ignorerait
                  `max-height`/`overflow` sans compter sur la blockification
                  implicite d'un `position:absolute`, une dépendance inutile) :
                  un plafond de hauteur + `overflow-hidden` empêchent tout
                  débordement hors du cadre, PUIS un fondu (`mask-image`, même
                  principe que `fade-truncate` ailleurs dans l'appli) sur une
                  zone plus haute qu'une ligne de texte entière (≈24px pour
                  ~17px de hauteur de ligne) — la dernière ligne partiellement
                  visible s'estompe TOUJOURS en entier, jamais de lettre
                  tranchée à mi-hauteur. */}
              <div className="absolute inset-x-0 bottom-0 max-h-[4.75rem] overflow-hidden p-3 text-[12.5px] font-medium leading-snug text-white [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]">
                {item.title}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
          {displayItems.map((item, i) => (
            <button
              key={item.url + i}
              type="button"
              onClick={() => onOpen(item.url)}
              className="block w-full truncate border-b border-white/[0.05] px-3.5 py-2.5 text-left text-[12px] text-ink-dim transition-colors last:border-b-0 hover:bg-white/[0.04] hover:text-ink"
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
