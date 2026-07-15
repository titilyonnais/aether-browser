/**
 * Téléchargements — page complète (façon chrome://downloads).
 * Le bouton de la barre de titre ouvre directement cette vue ; elle liste
 * l'historique complet, avec progression en direct pour les items actifs.
 */
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Link2,
  Music,
  RotateCcw,
  Trash2,
  Video,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DownloadEntry } from '@shared/types'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { remainingSeconds, useDownloadSpeed } from '@/hooks/useDownloadSpeed'
import { cn, formatBytes, formatDuration, groupByDay, timeOf } from '@/lib/utils'
import { useDownloadsStore } from '@/stores/downloads'
import { useUiStore } from '@/stores/ui'

type TypeFilter = 'all' | 'images' | 'videos' | 'audio' | 'documents' | 'archives'

const EXT_GROUPS: Record<Exclude<TypeFilter, 'all'>, string[]> = {
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'],
  videos: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'],
  documents: ['xls', 'xlsx', 'csv', 'ods', 'pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'md'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
}

function extOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function matchesTypeFilter(filename: string, filter: TypeFilter): boolean {
  return filter === 'all' || EXT_GROUPS[filter].includes(extOf(filename))
}

/** Icône selon l'extension — même trousseau visuel que le reste de l'appli. */
function fileIconFor(filename: string): typeof Download {
  const ext = extOf(filename)
  if (EXT_GROUPS.images.includes(ext)) return ImageIcon
  if (EXT_GROUPS.videos.includes(ext)) return Video
  if (EXT_GROUPS.audio.includes(ext)) return Music
  if (EXT_GROUPS.archives.includes(ext)) return Archive
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return FileSpreadsheet
  if (['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'md'].includes(ext)) return FileText
  return Download
}

async function copyLink(url: string, linkCopiedLabel: string): Promise<void> {
  await navigator.clipboard.writeText(url)
  useUiStore.getState().toast(linkCopiedLabel)
}

async function removeEntry(entry: DownloadEntry): Promise<void> {
  if (entry.state === 'progressing') await window.aether.downloads.cancel(entry.id)
  await window.aether.downloads.remove(entry.id)
  useDownloadsStore.getState().hydrate(useDownloadsStore.getState().entries.filter((e) => e.id !== entry.id))
}

export function DownloadsOverlay() {
  const open = useUiStore((s) => s.overlay === 'downloads')
  return <AnimatePresence>{open && <DownloadsPanel />}</AnimatePresence>
}

const TYPE_FILTERS: { id: TypeFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'overlays.downloads.filterAll' },
  { id: 'images', labelKey: 'overlays.downloads.filterImages' },
  { id: 'videos', labelKey: 'overlays.downloads.filterVideos' },
  { id: 'audio', labelKey: 'overlays.downloads.filterAudio' },
  { id: 'documents', labelKey: 'overlays.downloads.filterDocuments' },
  { id: 'archives', labelKey: 'overlays.downloads.filterArchives' }
]

function DownloadsPanel() {
  const t = useT()
  const entries = useDownloadsStore((s) => s.entries)
  const speeds = useDownloadSpeed(entries)
  const close = (): void => useUiStore.getState().closeOverlay()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    const load = (): void => {
      void window.aether.downloads.list().then((list) => useDownloadsStore.getState().hydrate(list))
    }
    load()
    // Revérifie l'existence des fichiers pendant que le panneau reste ouvert
    // (détection d'une suppression externe « immédiate », faute de veille filesystem).
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
  }, [])

  const clearAll = async (): Promise<void> => {
    await window.aether.downloads.clear(null)
    useDownloadsStore.getState().hydrate([])
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (!matchesTypeFilter(e.filename, typeFilter)) return false
      return !q || e.filename.toLowerCase().includes(q)
    })
  }, [entries, query, typeFilter])

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
          <Download size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.downloads.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.downloads.searchPlaceholder')}
            />
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAll()}
                title={t('overlays.downloads.clearAllTitle')}
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

        <SearchBar open={searchOpen} value={query} onChange={setQuery} placeholder={t('overlays.downloads.searchPlaceholder')} />

        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.06] px-4 py-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                typeFilter === f.id ? 'bg-glacier/15 text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {entries.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.downloads.emptyState')}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.downloads.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupByDay(filtered, (e) => e.startedAt).map((g) => (
                <div key={g.label}>
                  <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint/70">
                    {g.label}
                  </p>
                  <div className="space-y-1.5">
                    {g.items.map((d) => (
                      <DownloadRow key={d.id} entry={d} speed={speeds.get(d.id) ?? 0} t={t} />
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

function DownloadRow({
  entry,
  speed,
  t
}: {
  entry: DownloadEntry
  speed: number
  t: ReturnType<typeof useT>
}) {
  const pct = entry.totalBytes > 0 ? Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100)) : 0
  const deleted = entry.state === 'completed' && !entry.fileExists
  const canOpen = entry.state === 'completed' && entry.fileExists
  const Icon = fileIconFor(entry.filename)
  const remaining = entry.state === 'progressing' ? remainingSeconds(entry, speed) : null

  const subtitle = deleted
    ? t('overlays.downloads.deleted')
    : entry.state === 'progressing'
      ? [
          `${formatBytes(entry.receivedBytes)} / ${entry.totalBytes > 0 ? formatBytes(entry.totalBytes) : '?'}`,
          speed > 0 ? `${formatBytes(speed)}/s` : null,
          remaining !== null ? t('overlays.downloads.timeRemaining', { duration: formatDuration(remaining) }) : null
        ]
          .filter(Boolean)
          .join(' · ')
      : entry.state === 'completed'
        ? `${formatBytes(entry.totalBytes)} · ${timeOf(entry.completedAt ?? entry.startedAt)}`
        : entry.state === 'cancelled'
          ? t('overlays.downloads.cancelled')
          : t('overlays.downloads.interrupted')

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <Icon size={14} strokeWidth={1.6} className="text-ink-faint" />
        </span>
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => canOpen && void window.aether.downloads.openFile(entry.id)}
          className={cn('min-w-0 flex-1 text-left', canOpen && 'cursor-pointer')}
        >
          <p
            className={cn(
              'truncate text-[12.5px]',
              deleted ? 'text-ink-faint line-through' : canOpen ? 'text-ink hover:underline' : 'text-ink'
            )}
          >
            {entry.filename}
          </p>
          <p className="truncate text-[10.5px] text-ink-faint">{subtitle}</p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {entry.state === 'completed' && !deleted && (
            <>
              <button
                type="button"
                title={t('overlays.downloads.copyLinkTitle')}
                onClick={() => void copyLink(entry.url, t('overlays.downloads.linkCopied'))}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
              >
                <Link2 size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                title={t('overlays.downloads.showInFolder')}
                onClick={() => void window.aether.downloads.showInFolder(entry.id)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
              >
                <Folder size={12} strokeWidth={1.8} />
              </button>
            </>
          )}
          {(entry.state === 'interrupted' || entry.state === 'cancelled' || deleted) && (
            <RotateCcw size={12} strokeWidth={1.7} className="text-ink-faint/50" />
          )}
          <button
            type="button"
            title={entry.state === 'progressing' ? t('overlays.downloads.cancelAction') : t('overlays.downloads.removeFromHistory')}
            onClick={() => void removeEntry(entry)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-red-400/10 hover:text-red-200"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      {entry.state === 'progressing' && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={cn('h-full rounded-full bg-glacier transition-all duration-300')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
