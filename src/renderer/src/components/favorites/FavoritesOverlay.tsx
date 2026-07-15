/**
 * Favoris — page complète de gestion (façon chrome://bookmarks). Un favori
 * est une entité indépendante des pages (voir `Favorite` dans shared/types) :
 * il survit à la fermeture de l'onglet qui l'affichait. Cette vue les groupe
 * par DOSSIER (rangement manuel, voir favoriteFolders), avec un compartiment
 * « sans dossier ».
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Folder, FolderPlus, Link2, Star, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Favorite } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { SearchBar, SearchToggle } from '@/components/ui/SearchField'
import { useT } from '@/i18n/useT'
import { openFavoriteUrl } from '@/lib/actions'
import { cn, domainOf, hueColor } from '@/lib/utils'
import { useFavoriteFoldersStore } from '@/stores/favoriteFolders'
import { useFavoritesStore } from '@/stores/favorites'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

/** 'all' = pas de filtre par dossier, 'unfiled' = uniquement les favoris sans
 * dossier, sinon l'id d'un dossier précis. */
type FolderFilter = 'all' | 'unfiled' | string

async function copyLink(url: string, linkCopiedLabel: string): Promise<void> {
  await navigator.clipboard.writeText(url)
  useUiStore.getState().toast(linkCopiedLabel)
}

export function FavoritesOverlay() {
  const open = useUiStore((s) => s.overlay === 'favorites')
  return <AnimatePresence>{open && <FavoritesPanel />}</AnimatePresence>
}

function FavoritesPanel() {
  const t = useT()
  const favorites = useFavoritesStore((s) => s.favorites)
  const spaces = useSpacesStore((s) => s.spaces)
  const folders = useFavoriteFoldersStore((s) => s.folders)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const close = (): void => useUiStore.getState().closeOverlay()

  const spaceById = new Map(spaces.map((s) => [s.id, s]))

  const { byFolder, unfiled, resultCount } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (f: Favorite): boolean =>
      !q || f.title.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)
    const byFolder = new Map<string, Favorite[]>()
    const unfiled: Favorite[] = []
    let resultCount = 0
    for (const f of favorites) {
      if (!matches(f)) continue
      resultCount++
      if (f.folderId) {
        const list = byFolder.get(f.folderId) ?? []
        list.push(f)
        byFolder.set(f.folderId, list)
      } else {
        unfiled.push(f)
      }
    }
    return { byFolder, unfiled, resultCount }
  }, [favorites, query])

  const showFolder = (folderId: string): boolean => folderFilter === 'all' || folderFilter === folderId
  const showUnfiled = folderFilter === 'all' || folderFilter === 'unfiled'

  const openFavorite = (url: string): void => {
    void openFavoriteUrl(url)
    close()
  }

  const createFolder = async (): Promise<void> => {
    const name = newFolderName.trim()
    setCreatingFolder(false)
    setNewFolderName('')
    if (name) await window.aether.favoriteFolders.create(name)
  }

  const commitRenameFolder = async (id: string): Promise<void> => {
    const name = folderDraft.trim()
    setEditingFolderId(null)
    if (name) await window.aether.favoriteFolders.rename(id, name)
  }

  const removeFolder = async (id: string): Promise<void> => {
    await window.aether.favoriteFolders.remove(id)
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(560px,88vh)] w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <Star size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.favorites.title')}</p>
          <div className="ml-auto flex items-center gap-1">
            <SearchToggle
              open={searchOpen}
              onToggle={() => setSearchOpen((v) => !v)}
              title={t('overlays.favorites.searchPlaceholder')}
            />
            <button
              type="button"
              title={t('overlays.favorites.newFolder')}
              onClick={() => setCreatingFolder(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <FolderPlus size={15} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              <X size={15} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <SearchBar open={searchOpen} value={query} onChange={setQuery} placeholder={t('overlays.favorites.searchPlaceholder')} />

        {folders.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.06] px-4 py-2">
            <button
              type="button"
              onClick={() => setFolderFilter('all')}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                folderFilter === 'all' ? 'bg-glacier/15 text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
              )}
            >
              {t('overlays.favorites.filterAllFolders')}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolderFilter(f.id)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                  folderFilter === f.id ? 'bg-glacier/15 text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
                )}
              >
                {f.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFolderFilter('unfiled')}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors',
                folderFilter === 'unfiled' ? 'bg-glacier/15 text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
              )}
            >
              {t('overlays.favorites.noFolder')}
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {creatingFolder && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-glacier/30 bg-glacier/[0.05] px-2.5 py-2">
              <Folder size={13} strokeWidth={1.8} className="shrink-0 text-glacier" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createFolder()
                  if (e.key === 'Escape') setCreatingFolder(false)
                }}
                onBlur={() => void createFolder()}
                placeholder={t('overlays.favorites.newFolderPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          )}

          {favorites.length === 0 && !creatingFolder ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.favorites.emptyHint')}
              </p>
            </div>
          ) : resultCount === 0 && !creatingFolder ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {t('overlays.favorites.noResults')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {folders.map((folder) => {
                if (!showFolder(folder.id)) return null
                const items = byFolder.get(folder.id) ?? []
                if (query.trim() && items.length === 0) return null
                return (
                  <div key={folder.id}>
                    <div className="group flex items-center gap-1.5 px-1 pb-1.5">
                      <Folder size={11} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
                      {editingFolderId === folder.id ? (
                        <input
                          autoFocus
                          value={folderDraft}
                          onChange={(e) => setFolderDraft(e.target.value)}
                          onBlur={() => void commitRenameFolder(folder.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRenameFolder(folder.id)
                            if (e.key === 'Escape') setEditingFolderId(null)
                          }}
                          className="min-w-0 flex-1 bg-transparent text-[10px] font-medium uppercase tracking-[0.12em] text-ink outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFolderId(folder.id)
                            setFolderDraft(folder.name)
                          }}
                          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint/70 transition-colors hover:text-ink-dim"
                        >
                          {folder.name}
                        </button>
                      )}
                      <span className="text-[9px] text-ink-faint/50">{items.length}</span>
                      <button
                        type="button"
                        title={t('overlays.favorites.deleteFolder')}
                        onClick={() => void removeFolder(folder.id)}
                        className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100"
                      >
                        <Trash2 size={11} strokeWidth={1.8} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {items.length === 0 ? (
                        <p className="px-2 py-1 text-[11px] text-ink-faint/60">
                          {t('overlays.favorites.emptyFolder')}
                        </p>
                      ) : (
                        items.map((f) => (
                          <FavoriteRow
                            key={f.id}
                            favorite={f}
                            space={f.spaceId ? spaceById.get(f.spaceId) : undefined}
                            folders={folders}
                            t={t}
                            onOpen={openFavorite}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}

              {showUnfiled && (unfiled.length > 0 || folders.length === 0) && (
                <div>
                  {folders.length > 0 && (
                    <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint/70">
                      {t('overlays.favorites.noFolder')}
                    </p>
                  )}
                  <div className="space-y-1">
                    {unfiled.map((f) => (
                      <FavoriteRow
                        key={f.id}
                        favorite={f}
                        space={f.spaceId ? spaceById.get(f.spaceId) : undefined}
                        folders={folders}
                        t={t}
                        onOpen={openFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}

function FavoriteRow({
  favorite,
  space,
  folders,
  t,
  onOpen
}: {
  favorite: Favorite
  space: { hue: number; name: string } | undefined
  folders: { id: string; name: string }[]
  t: (key: string, vars?: Record<string, string | number>) => string
  onOpen: (url: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
      {space && (
        <span
          title={space.name}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: hueColor(space.hue, 0.9) }}
        />
      )}
      <Favicon url={favorite.url} faviconUrl={favorite.faviconUrl} size={13} />
      <button type="button" onClick={() => onOpen(favorite.url)} className="min-w-0 flex-1 text-left">
        <p className={cn('fade-truncate text-[12px] text-ink-dim')}>{favorite.title || domainOf(favorite.url)}</p>
        <p className="fade-truncate font-mono text-[10px] text-ink-faint">{domainOf(favorite.url)}</p>
      </button>
      <FolderPicker
        value={favorite.folderId}
        folders={folders}
        noFolderLabel={t('overlays.favorites.noFolder')}
        title={t('overlays.favorites.moveToFolder')}
        onChange={(id) => void window.aether.favorites.setFolder(favorite.id, id)}
      />
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title={t('overlays.favorites.copyLinkTitle')}
          onClick={() => void copyLink(favorite.url, t('overlays.favorites.linkCopied'))}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
        >
          <Link2 size={12} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          title={t('overlays.favorites.removeFavorite')}
          onClick={() => void window.aether.favorites.remove(favorite.id)}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-red-400/10 hover:text-red-200"
        >
          <X size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}

/** Sélecteur de dossier — remplace un `<select>` natif, dont le menu déroulant
 * ouvert est entièrement dessiné par l'OS et ignore le style de l'appli
 * (capture d'écran à l'appui : rectangle blanc plat, hors charte). Overlay
 * DOM classique ici : contrairement aux popovers qui chevauchent une page
 * vivante, cette vue est un plein-écran qui masque déjà les pages (voir
 * `pages.setOverlay`), donc aucun souci de superposition avec une WebContentsView. */
function FolderPicker({
  value,
  folders,
  noFolderLabel,
  title,
  onChange
}: {
  value: string | null
  folders: { id: string; name: string }[]
  noFolderLabel: string
  title: string
  onChange: (folderId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const label = value ? (folders.find((f) => f.id === value)?.name ?? noFolderLabel) : noFolderLabel

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id: string | null): void => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] transition-colors',
          open ? 'border-glacier/40 text-ink-dim' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
        )}
      >
        <span className="max-w-20 truncate">{label}</span>
        <ChevronDown size={10} strokeWidth={2.2} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-[calc(100%+4px)] z-20 max-h-56 w-40 overflow-y-auto rounded-lg p-1 shadow-xl">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors',
              !value ? 'text-glacier' : 'text-ink-dim hover:bg-white/[0.06]'
            )}
          >
            <span className="truncate">{noFolderLabel}</span>
            {!value && <Check size={11} strokeWidth={2.2} className="shrink-0" />}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => pick(f.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors',
                value === f.id ? 'text-glacier' : 'text-ink-dim hover:bg-white/[0.06]'
              )}
            >
              <span className="truncate">{f.name}</span>
              {value === f.id && <Check size={11} strokeWidth={2.2} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
