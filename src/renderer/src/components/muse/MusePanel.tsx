/**
 * Muse — compagnon de pensée contextuel (panneau droit).
 * Comprend la page active et la sélection de la constellation ; parle via
 * le provider hybride (Ollama local d'abord, APIs ensuite) en streaming.
 */
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  Copy,
  MessageCircle,
  Pencil,
  Pin,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  StickyNote,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AiStatus } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { Spinner } from '@/components/ui/Spinner'
import { useT, type TFunction } from '@/i18n/useT'
import { getActivePage, museAbort, museSend, pinNote, removeNote, updateNote } from '@/lib/actions'
import { cn, timeAgo } from '@/lib/utils'
import { useMuseStore, type MuseMessage } from '@/stores/muse'
import { usePagesStore } from '@/stores/pages'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

const PANEL_MIN_WIDTH = 300
const PANEL_MAX_WIDTH = 560
const PANEL_DEFAULT_WIDTH = 352
const PANEL_WIDTH_KEY = 'aether:museWidth'

/** Largeur du panneau, redimensionnable (bord gauche) et mémorisée entre sessions. */
function usePanelWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    return stored >= PANEL_MIN_WIDTH && stored <= PANEL_MAX_WIDTH ? stored : PANEL_DEFAULT_WIDTH
  })
  const setClamped = (w: number): void => {
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w))
    setWidth(clamped)
    localStorage.setItem(PANEL_WIDTH_KEY, String(clamped))
  }
  return [width, setClamped]
}

export function MusePanel() {
  const t = useT()
  const open = useUiStore((s) => s.museOpen)
  const [width, setWidth] = usePanelWidth()
  const [isDragging, setIsDragging] = useState(false)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width
    // Panneau ancré à droite, bord de redimensionnement à gauche : glisser
    // vers la gauche (delta négatif) doit AGRANDIR le panneau.
    const onMove = (ev: MouseEvent): void => setWidth(startWidth - (ev.clientX - startX))
    const onUp = (): void => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? width : 0 }}
      transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 38 }}
      className="relative z-20 shrink-0 overflow-hidden border-l hairline bg-abyss/50"
    >
      <div className="flex h-full flex-col" style={{ width }}>
        <MuseHeader />
        <MuseBody />
      </div>
      {open && (
        <div
          onMouseDown={startResize}
          title={t('shell.constellation.resizeHandle')}
          className={cn(
            'absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-glacier/40',
            isDragging && 'bg-glacier/50'
          )}
        />
      )}
    </motion.aside>
  )
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

function MuseHeader() {
  const t = useT()
  const tab = useMuseStore((s) => s.tab)
  const notes = useMuseStore((s) => s.notes)
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const noteCount = notes.filter((n) => n.spaceId === spaceId).length

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b hairline px-3.5">
      <Sparkles size={14} strokeWidth={1.6} className="text-lavande" />
      <span className="font-display text-[15px] italic text-ink">Muse</span>
      <ProviderChip />
      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          title={t('focusCanvas.musePanel.dialogueTab')}
          onClick={() => useMuseStore.getState().setTab('chat')}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md transition-colors',
            tab === 'chat' ? 'bg-white/[0.06] text-ink-dim' : 'text-ink-faint hover:text-ink-dim'
          )}
        >
          <MessageCircle size={12.5} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          title={t('focusCanvas.musePanel.notesTab', { count: noteCount })}
          onClick={() => useMuseStore.getState().setTab('notes')}
          className={cn(
            'relative grid h-7 w-7 place-items-center rounded-md transition-colors',
            tab === 'notes' ? 'bg-white/[0.06] text-ink-dim' : 'text-ink-faint hover:text-ink-dim'
          )}
        >
          <StickyNote size={12.5} strokeWidth={1.7} />
          {noteCount > 0 && (
            <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-lavande/80" />
          )}
        </button>
      </div>
    </header>
  )
}

function ProviderChip() {
  const t = useT()
  const aiStatus = useSettingsStore((s) => s.aiStatus)
  const label = providerLabel(aiStatus, t)
  const tone =
    aiStatus?.active === 'ollama'
      ? 'bg-emerald-300'
      : aiStatus && aiStatus.active !== 'none'
        ? 'bg-lavande'
        : 'bg-ink-faint'
  return (
    <span className="ml-1 flex min-w-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-0.5">
      <span className={cn('h-1.5 w-1.5 shrink-0 animate-pulse-dot rounded-full', tone)} />
      <span className="truncate text-[10px] text-ink-faint">{label}</span>
    </span>
  )
}

function providerLabel(s: AiStatus | null, t: TFunction): string {
  if (!s || s.active === 'none') return t('focusCanvas.musePanel.providerOffline')
  if (s.active === 'ollama') {
    const model = s.activeModel?.split(':')[0] ?? 'local'
    return t('focusCanvas.musePanel.providerLocal', { model })
  }
  const names = { anthropic: 'Claude', openai: 'OpenAI', xai: 'xAI' } as const
  return names[s.active]
}

// ─── Corps ───────────────────────────────────────────────────────────────────

function MuseBody() {
  const tab = useMuseStore((s) => s.tab)
  return tab === 'chat' ? <ChatTab /> : <NotesTab />
}

function ChatTab() {
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const messages = useMuseStore((s) => (spaceId ? (s.messagesBySpace[spaceId] ?? EMPTY) : EMPTY))
  const streamingId = useMuseStore((s) => s.streamingId)
  const aiStatus = useSettingsStore((s) => s.aiStatus)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Suivi du fil : colle en bas tant que l'utilisateur n'a pas remonté.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  const offline = !aiStatus || aiStatus.active === 'none'

  return (
    <>
      <ContextChips />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          offline ? (
            <OfflineState />
          ) : (
            <EmptyThread />
          )
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <Message key={m.id} msg={m} />
            ))}
          </div>
        )}
      </div>
      <MuseInput disabled={offline} streaming={streamingId !== null} />
    </>
  )
}

const EMPTY: MuseMessage[] = []

function ContextChips() {
  const t = useT()
  const includePage = useMuseStore((s) => s.includePageContext)
  const pages = usePagesStore((s) => s.pages)
  const focusBySpace = usePagesStore((s) => s.focusBySpace)
  void focusBySpace
  const selectedId = useUiStore((s) => s.selectedPageId)
  const page = getActivePage()
  const selected = selectedId && selectedId !== page?.id ? (pages[selectedId] ?? null) : null

  if (!page && !selected) return null
  return (
    <div className="flex flex-wrap gap-1.5 border-b hairline px-3.5 py-2.5">
      {page && (
        <button
          type="button"
          title={
            includePage
              ? t('focusCanvas.musePanel.contextIncluded')
              : t('focusCanvas.musePanel.contextExcluded')
          }
          onClick={() => useMuseStore.getState().setIncludePageContext(!includePage)}
          className={cn(
            'flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 transition-colors',
            includePage
              ? 'border-glacier/25 bg-glacier/[0.06] text-ink-dim'
              : 'border-white/[0.07] bg-transparent text-ink-faint line-through'
          )}
        >
          <Favicon url={page.url} faviconUrl={page.faviconUrl} size={11} />
          <span className="truncate text-[10.5px]">{page.title || t('focusCanvas.musePanel.activePage')}</span>
        </button>
      )}
      {selected && (
        <span className="flex max-w-full items-center gap-1.5 rounded-full border border-lavande/20 bg-lavande/[0.05] px-2 py-1 text-ink-faint">
          <Favicon url={selected.url} faviconUrl={selected.faviconUrl} size={11} />
          <span className="truncate text-[10.5px]">{selected.title || t('focusCanvas.musePanel.selection')}</span>
        </span>
      )}
    </div>
  )
}

// ─── Messages ────────────────────────────────────────────────────────────────

function Message({ msg }: { msg: MuseMessage }) {
  const t = useT()
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] select-text rounded-2xl rounded-br-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2 text-[12.5px] leading-relaxed text-ink">
          {msg.content}
        </div>
      </div>
    )
  }
  const isError = msg.status === 'error'
  return (
    <div className="group">
      <div className="flex items-center gap-1.5 pb-1">
        <Sparkles size={10} strokeWidth={1.8} className="text-lavande/70" />
        <span className="text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">Muse</span>
        {msg.status === 'done' && msg.content && (
          <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title={t('focusCanvas.musePanel.copy')}
              onClick={() => void navigator.clipboard.writeText(msg.content)}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <Copy size={11} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              title={t('focusCanvas.musePanel.pinNote')}
              onClick={() => void pinNote(msg.content)}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-white/[0.05] hover:text-lavande"
            >
              <Pin size={11} strokeWidth={1.7} />
            </button>
          </span>
        )}
      </div>
      <div
        className={cn(
          'select-text text-[12.5px] leading-[1.65]',
          isError ? 'text-red-200/80' : 'text-ink-dim'
        )}
      >
        {msg.content ? (
          <MarkdownLite text={msg.content} />
        ) : msg.status === 'streaming' ? (
          <span className="flex items-center gap-2 text-ink-faint">
            <Spinner size={11} /> {t('focusCanvas.musePanel.thinking')}
          </span>
        ) : null}
        {msg.status === 'streaming' && msg.content && (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse-dot bg-glacier/80 align-middle" />
        )}
      </div>
    </div>
  )
}

/** Rendu markdown volontairement minimal : blocs de code, listes, gras, code inline. */
function MarkdownLite({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/```(?:\w*)\n?/), [text])
  return (
    <>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="my-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink-dim"
          >
            {block.replace(/\n$/, '')}
          </pre>
        ) : (
          <TextBlock key={i} text={block} />
        )
      )}
    </>
  )
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: string[] = []
  const flushList = (key: string): void => {
    if (list.length === 0) return
    out.push(
      <ul key={key} className="my-1.5 space-y-1 pl-1">
        {list.map((item, j) => (
          <li key={j} className="flex gap-2">
            <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-glacier/60" />
            <span className="min-w-0">{inline(item)}</span>
          </li>
        ))}
      </ul>
    )
    list = []
  }
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    const li = /^[-*•]\s+(.*)$/.exec(trimmed) ?? /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (li) {
      list.push(li[1])
      return
    }
    flushList(`l-${i}`)
    if (trimmed === '') return
    const heading = /^#{1,4}\s+(.*)$/.exec(trimmed)
    if (heading) {
      out.push(
        <p key={i} className="mb-1 mt-2.5 text-[12px] font-semibold tracking-wide text-ink">
          {inline(heading[1])}
        </p>
      )
      return
    }
    out.push(
      <p key={i} className="my-1.5">
        {inline(trimmed)}
      </p>
    )
  })
  flushList('l-end')
  return <>{out}</>
}

/** Gras `**…**` et code inline `` `…` ``. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded bg-white/[0.06] px-1 py-px font-mono text-[11px] text-glacier">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ─── États vides ─────────────────────────────────────────────────────────────

function EmptyThread() {
  const t = useT()
  const page = getActivePage()
  const suggestions = [
    ...(page
      ? [
          {
            label: t('focusCanvas.musePanel.suggestSummarizeLabel'),
            prompt: t('focusCanvas.musePanel.suggestSummarizePrompt')
          },
          {
            label: t('focusCanvas.musePanel.suggestKeyPointsLabel'),
            prompt: t('focusCanvas.musePanel.suggestKeyPointsPrompt')
          }
        ]
      : []),
    {
      label: t('focusCanvas.musePanel.suggestExploreLabel'),
      prompt: t('focusCanvas.musePanel.suggestExplorePrompt')
    }
  ]
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 pb-10 text-center">
      <p className="font-display text-[21px] italic leading-snug text-ink-dim">
        {t('focusCanvas.musePanel.emptyThreadTitle')}
      </p>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => void museSend(s.prompt)}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:border-lavande/30 hover:text-ink-dim"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function OfflineState() {
  const t = useT()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 pb-10 text-center">
      <Sparkles size={20} strokeWidth={1.3} className="text-ink-faint" />
      <p className="font-display text-[19px] italic text-ink-dim">
        {t('focusCanvas.musePanel.offlineTitle')}
      </p>
      <p className="text-[11.5px] leading-relaxed text-ink-faint">
        {t('focusCanvas.musePanel.offlineIntro')}{' '}
        <span className="font-mono text-ink-dim">Ollama</span>{' '}
        {t('focusCanvas.musePanel.offlineOutro')}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void useSettingsStore.getState().refreshAi()}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-1.5 text-[11.5px] text-ink-dim transition-colors hover:border-glacier/40"
        >
          <RefreshCw size={11} strokeWidth={1.8} />
          {t('focusCanvas.musePanel.detect')}
        </button>
        <button
          type="button"
          onClick={() => useUiStore.getState().openOverlay('settings')}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-1.5 text-[11.5px] text-ink-dim transition-colors hover:border-lavande/40"
        >
          <Settings2 size={11} strokeWidth={1.8} />
          {t('focusCanvas.musePanel.configure')}
        </button>
      </div>
    </div>
  )
}

// ─── Saisie ──────────────────────────────────────────────────────────────────

function MuseInput({ disabled, streaming }: { disabled: boolean; streaming: boolean }) {
  const t = useT()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const send = (): void => {
    if (streaming || disabled || !value.trim()) return
    void museSend(value)
    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  return (
    <div className="shrink-0 border-t hairline p-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition-all duration-150 focus-within:border-lavande/45 focus-within:bg-lavande/[0.05] focus-within:shadow-[0_0_0_3px_rgba(179,164,230,0.1)]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
            if (e.key === 'Escape' && streaming) museAbort()
          }}
          placeholder={
            disabled
              ? t('focusCanvas.musePanel.inputPlaceholderDisabled')
              : t('focusCanvas.musePanel.inputPlaceholder')
          }
          className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:opacity-50"
        />
        {streaming ? (
          <button
            type="button"
            title={t('focusCanvas.musePanel.stop')}
            onClick={() => museAbort()}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-dim transition-colors hover:text-red-200"
          >
            <Square size={11} strokeWidth={1.8} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            title={t('focusCanvas.musePanel.send')}
            onClick={send}
            disabled={disabled || !value.trim()}
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all',
              value.trim() && !disabled
                ? 'bg-lavande/90 text-ink-onaccent hover:bg-lavande'
                : 'bg-white/[0.04] text-ink-faint'
            )}
          >
            <ArrowUp size={13} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function NotesTab() {
  const t = useT()
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const notes = useMuseStore((s) => s.notes).filter((n) => n.spaceId === spaceId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (id: string, content: string): void => {
    setEditingId(id)
    setDraft(content)
  }

  const commitEdit = (id: string): void => {
    void updateNote(id, draft)
    setEditingId(null)
  }

  if (notes.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-6 pb-10 text-center">
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          {t('focusCanvas.musePanel.notesEmptyLine1')}
          <br />
          {t('focusCanvas.musePanel.notesEmptyLine2')}
        </p>
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <AnimatePresence initial={false}>
        {notes.map((note) => {
          const isEditing = editingId === note.id
          return (
            <motion.article
              key={note.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingId(null)
                    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitEdit(note.id)
                  }}
                  onBlur={() => commitEdit(note.id)}
                  rows={4}
                  className="w-full resize-none rounded-lg bg-white/[0.04] p-2 text-[12px] leading-relaxed text-ink outline-none"
                />
              ) : (
                <p
                  onClick={() => startEdit(note.id, note.content)}
                  title={t('focusCanvas.musePanel.editNote')}
                  className="line-clamp-5 cursor-text select-text whitespace-pre-wrap text-[12px] leading-relaxed text-ink-dim"
                >
                  {note.content}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-faint">
                {note.pageTitle && <span className="truncate">{note.pageTitle}</span>}
                <span className="ml-auto shrink-0">{timeAgo(note.createdAt)}</span>
                {!isEditing && (
                  <button
                    type="button"
                    title={t('focusCanvas.musePanel.editNote')}
                    aria-label={t('focusCanvas.musePanel.editNote')}
                    onClick={() => startEdit(note.id, note.content)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-ink-dim group-hover:opacity-100"
                  >
                    <Pencil size={10.5} strokeWidth={1.7} />
                  </button>
                )}
                <button
                  type="button"
                  title={t('focusCanvas.musePanel.deleteNote')}
                  aria-label={t('focusCanvas.musePanel.deleteNote')}
                  onClick={() => void removeNote(note.id)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100"
                >
                  <Trash2 size={10.5} strokeWidth={1.7} />
                </button>
              </div>
            </motion.article>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
