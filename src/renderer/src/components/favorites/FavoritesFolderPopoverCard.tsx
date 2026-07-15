/**
 * Contenu du popup natif « contenu d'un dossier de favoris » (voir
 * FavoritesBar.tsx et PopoverRoot.tsx) — rendu dans la fenêtre popup, PAS
 * dans la fenêtre principale : aucun store Zustand partagé (process de rendu
 * séparé), donc tout est refetché via IPC (`favorites.list`/`favoriteFolders.list`)
 * et resynchronisé sur `onUpdated` tant que le popup reste ouvert.
 *
 * Glisser-déposer : réordonner À L'INTÉRIEUR de ce popup (drag start ET drop
 * tous deux dans la MÊME fenêtre) reste fiable. Sortir un favori du dossier
 * PAR glisser vers la fenêtre principale ne l'est PAS (glisser-déposer entre
 * deux fenêtres Electron distinctes s'est déjà montré peu fiable dans ce
 * projet) — clic droit → « Déplacer vers » → « Sans dossier » est la voie
 * fiable pour ça, déjà proposée par le menu contextuel natif existant.
 */
import { Folder, X } from 'lucide-react'
import { useEffect, useState, type DragEvent } from 'react'
import type { Favorite, FavoriteFolder } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { translate, type Locale } from '@/i18n'
import { domainOf } from '@/lib/utils'

interface FavoritesFolderPopoverCardProps {
  folderId: string
  /** Instantané déjà connu de l'appelant (FavoritesBar.tsx a ces données dans
   * son propre store) — rendu dès le tout premier frame, sans attendre un
   * aller-retour IPC (seule vraie source de la lenteur perçue par rapport
   * aux autres popups, qui n'ont rien à charger de façon asynchrone). Le
   * `refresh()` ci-dessous reste le mécanisme de resynchronisation pendant
   * que le popup reste ouvert (favoris ajoutés/retirés ailleurs…). */
  initialFolder: FavoriteFolder
  initialItems: Favorite[]
  locale: string
}

const DRAG_MIME = 'application/x-aether-favorite-id'
/** Même élargissement qu'en FavoritesBar.tsx : viser tout au début/toute la
 * fin ne demande pas de relâcher pile sur le trait d'insertion. */
const EDGE_ZONE_FRACTION = 0.3

function edgeAwareSplit(isFirst: boolean, isLast: boolean): number {
  if (isFirst) return 1 - EDGE_ZONE_FRACTION
  if (isLast) return EDGE_ZONE_FRACTION
  return 0.5
}

function closePopover(): void {
  window.aether.popover.hide()
}

export function FavoritesFolderPopoverCard({
  folderId,
  initialFolder,
  initialItems,
  locale
}: FavoritesFolderPopoverCardProps) {
  const loc = locale as Locale
  const [folder, setFolder] = useState<FavoriteFolder | null>(initialFolder)
  const [items, setItems] = useState<Favorite[]>(initialItems)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)

  const refresh = (): void => {
    void window.aether.favoriteFolders.list().then((folders) => setFolder(folders.find((f) => f.id === folderId) ?? null))
    void window.aether.favorites
      .list()
      .then((all) => setItems(all.filter((f) => f.folderId === folderId).sort((a, b) => a.position - b.position)))
  }

  // Resynchronise en tâche de fond (favoris ajoutés/retirés ailleurs pendant
  // que ce popup reste ouvert) — l'instantané initial ci-dessus suffit déjà
  // pour le tout premier rendu, ce premier `refresh()` n'est qu'un filet.
  useEffect(refresh, [folderId])
  useEffect(() => window.aether.favorites.onUpdated(refresh), [folderId])
  useEffect(() => window.aether.favoriteFolders.onUpdated(refresh), [folderId])

  const commitReorder = (targetIndex: number): void => {
    if (!draggedId) return
    const draggedOriginalIndex = items.findIndex((f) => f.id === draggedId)
    const adjusted = draggedOriginalIndex !== -1 && draggedOriginalIndex < targetIndex ? targetIndex - 1 : targetIndex
    const withoutDragged = items.filter((f) => f.id !== draggedId)
    const clamped = Math.max(0, Math.min(adjusted, withoutDragged.length))
    const newOrder = [
      ...withoutDragged.slice(0, clamped).map((f) => f.id),
      draggedId,
      ...withoutDragged.slice(clamped).map((f) => f.id)
    ]
    void window.aether.favorites.reorder(newOrder)
  }

  const openFavorite = (url: string): void => window.aether.favorites.requestOpen(url)

  if (!folder) return null

  return (
    <div className="popover-surface w-80 overflow-hidden rounded-xl p-2">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <Folder size={12} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint/80">
          {folder.name}
        </span>
        <button
          type="button"
          onClick={closePopover}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink-dim"
        >
          <X size={12} strokeWidth={1.8} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-1 py-2 text-[11.5px] text-ink-faint/70">
          {translate(loc, 'overlays.favorites.emptyFolder')}
        </p>
      ) : (
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {items.map((f, i) => {
            const isFirst = i === 0
            const isLast = i === items.length - 1
            const showBefore = insertionIndex === i
            const showAfter = isLast && insertionIndex === i + 1
            return (
              <div key={f.id} className="relative">
                {showBefore && <span className="absolute inset-x-1 -top-0.5 z-10 h-0.5 rounded-full bg-glacier" />}
                {showAfter && <span className="absolute inset-x-1 -bottom-0.5 z-10 h-0.5 rounded-full bg-glacier" />}
                <button
                  type="button"
                  draggable
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.setData(DRAG_MIME, f.id)
                    setDraggedId(f.id)
                    setInsertionIndex(null)
                  }}
                  onDragOver={(e: DragEvent) => {
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const split = edgeAwareSplit(isFirst, isLast)
                    setInsertionIndex(e.clientY < rect.top + rect.height * split ? i : i + 1)
                  }}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const split = edgeAwareSplit(isFirst, isLast)
                    commitReorder(e.clientY < rect.top + rect.height * split ? i : i + 1)
                    setInsertionIndex(null)
                    setDraggedId(null)
                  }}
                  onDragEnd={() => {
                    setDraggedId(null)
                    setInsertionIndex(null)
                  }}
                  onClick={() => openFavorite(f.url)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    // Coordonnées locales à CE popup, pas à la fenêtre principale — sans
                    // conséquence : le main détecte l'appel venant du popup et bascule
                    // sur un menu natif classique (voir isPopoverWebContents, ipc.ts).
                    window.aether.favorites.showContextMenu(f.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 })
                  }}
                  title={f.title || domainOf(f.url)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-dim transition-colors hover:bg-white/[0.06]"
                >
                  <Favicon url={f.url} faviconUrl={f.faviconUrl} size={13} />
                  <span className="min-w-0 flex-1 truncate">{f.title || domainOf(f.url)}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
