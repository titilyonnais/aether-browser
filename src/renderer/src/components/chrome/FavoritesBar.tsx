/**
 * Barre de favoris — une bande fine sous la barre de titre listant les
 * favoris (entité indépendante des pages, voir `Favorite` dans shared/types)
 * de l'espace actif (ou de tous les espaces, groupées par pastille de
 * couleur, selon le réglage). Cliquer ouvre/focus la page correspondante,
 * clic droit propose un menu natif (voir main/ipc.ts `favoriteShowContextMenu`).
 *
 * Réordonner deux favoris (glisser-déposer, indicateur d'insertion précis
 * entre deux éléments) et déplacer un favori dans/hors d'un dossier (déposer
 * sur sa pastille) fonctionnent directement ici, dans la MÊME fenêtre — donc
 * toujours fiables. Le CONTENU d'un dossier (clic sur sa pastille), lui,
 * s'affiche dans une vraie fenêtre popup native flottante (voir
 * `main/popoverWindow.ts`, même mécanisme que le menu principal/infos de
 * site/traduction) — PAS un élément DOM superposé à la page : un essai
 * précédent avec un DOM `position:absolute` par-dessus la zone de contenu a
 * produit un rectangle noir (la `WebContentsView` d'une page compose TOUJOURS
 * au-dessus du DOM, quel que soit le z-index — reculer sa borne pour révéler
 * un DOM en dessous s'est montré peu fiable dans ce projet). Conséquence
 * acceptée : réordonner/sortir un favori PENDANT que le popup d'un dossier est
 * ouvert se fait via clic droit → « Déplacer vers » plutôt que par glisser
 * (glisser-déposer entre deux fenêtres Electron distinctes s'est déjà montré
 * peu fiable). Le débordement (flèche finale) et les actions d'un dossier
 * (clic droit, renommer/supprimer) restent des menus natifs Electron.
 */
import { ChevronDown, Folder, LayoutList, Star } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from 'react'
import type { Favorite, FavoriteFolder, FavoritesOverflowEntry } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { useT } from '@/i18n/useT'
import { openFavoriteUrl } from '@/lib/actions'
import { cn, domainOf, hueColor } from '@/lib/utils'
import { useFavoriteFoldersStore } from '@/stores/favoriteFolders'
import { useFavoritesStore } from '@/stores/favorites'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

const DRAG_MIME = 'application/x-aether-favorite-id'
const CHEVRON_RESERVE = 30
const ITEM_GAP = 4
/** Fraction élargie (au lieu de 50/50) aux DEUX extrémités d'un conteneur —
 * pour placer un favori tout au début/tout à la fin, il suffit de lâcher
 * n'importe où dans cette zone plutôt que de viser précisément le trait
 * d'insertion sur la moitié exacte du premier/dernier favori. */
const EDGE_ZONE_FRACTION = 0.3

/** 'root' = la barre elle-même (favoris sans dossier), sinon l'id d'un dossier. */
type Container = 'root' | string

interface Insertion {
  container: Container
  index: number
}

type Entry =
  | { kind: 'folder'; id: string; folder: FavoriteFolder; items: Favorite[] }
  | { kind: 'favorite'; id: string; favorite: Favorite }

/** Fraction (0-1) de la largeur d'un favori, depuis la gauche, où bascule
 * l'insertion de « avant lui » à « après lui » — élargie aux deux bouts d'un
 * conteneur (voir EDGE_ZONE_FRACTION). */
function edgeAwareSplit(isFirst: boolean, isLast: boolean): number {
  if (isFirst) return 1 - EDGE_ZONE_FRACTION
  if (isLast) return EDGE_ZONE_FRACTION
  return 0.5
}

function computeInsertIndex(e: DragEvent, index: number, isFirst: boolean, isLast: boolean): number {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientX < rect.left + rect.width * edgeAwareSplit(isFirst, isLast) ? index : index + 1
}

/** Trouve l'index d'insertion le plus proche du curseur parmi les favoris
 * réellement rendus dans `containerEl` (chacun tagué `data-fav-id`). Sert de
 * repli pour un dépôt qui atterrit dans l'interstice ENTRE deux favoris (le
 * `gap-1` du flex, qui n'appartient à aucun bouton) : sans ça, l'évènement
 * remonte jusqu'au conteneur entier et se rabattait sur "ajouter en fin de
 * liste", plaçant le favori loin de l'endroit visé par l'utilisateur. */
function nearestContainerIndex(containerEl: HTMLElement, clientX: number, list: Favorite[]): number {
  const chipEls = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-fav-id]'))
  for (let i = 0; i < chipEls.length; i++) {
    const el = chipEls[i]
    const idx = list.findIndex((f) => f.id === el.getAttribute('data-fav-id'))
    if (idx === -1) continue
    const rect = el.getBoundingClientRect()
    const split = edgeAwareSplit(i === 0, i === chipEls.length - 1)
    if (clientX < rect.left + rect.width * split) return idx
  }
  return list.length
}

/** Bouton toujours visible (hors zone défilante) qui ouvre la page de
 * gestion complète des favoris — même icône que dans le menu principal. */
function ManageButton() {
  const t = useT()
  return (
    <button
      type="button"
      title={t('shell.favoritesBar.manage')}
      onClick={() => useUiStore.getState().openOverlay('favorites')}
      className="no-drag grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
    >
      <LayoutList size={13} strokeWidth={1.7} />
    </button>
  )
}

/** Un favori — source ET cible de glisser-déposer précis (moitié gauche/droite
 * de son propre rectangle détermine si on insère avant ou après lui). */
function FavoriteChip({
  favorite,
  container,
  index,
  isFirst,
  isLast,
  insertion,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  forMeasure = false
}: {
  favorite: Favorite
  container: Container
  index: number
  isFirst: boolean
  isLast: boolean
  insertion: Insertion | null
  onDragStartItem: (id: string) => void
  onDragOverItem: (container: Container, index: number) => void
  onDropItem: (container: Container, index: number, e: DragEvent) => void
  forMeasure?: boolean
}) {
  const t = useT()
  const spaces = useSpacesStore((s) => s.spaces)
  const groupBySpace = useSettingsStore((s) => s.settings?.groupFavoritesBySpace ?? true)
  const space = favorite.spaceId ? spaces.find((s) => s.id === favorite.spaceId) : undefined
  const showBefore = insertion?.container === container && insertion.index === index
  const showAfter = isLast && insertion?.container === container && insertion.index === index + 1

  return (
    <div className="relative shrink-0" data-fav-id={favorite.id}>
      {showBefore && <span className="absolute -left-[3px] top-0.5 bottom-0.5 z-10 w-0.5 rounded-full bg-glacier" />}
      {showAfter && <span className="absolute -right-[3px] top-0.5 bottom-0.5 z-10 w-0.5 rounded-full bg-glacier" />}
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, favorite.id)
          onDragStartItem(favorite.id)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDragOverItem(container, computeInsertIndex(e, index, isFirst, isLast))
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDropItem(container, computeInsertIndex(e, index, isFirst, isLast), e)
        }}
        title={t('shell.favoritesBar.pageTitle', { title: favorite.title || domainOf(favorite.url), space: space?.name ?? '' })}
        onClick={() => !forMeasure && void openFavoriteUrl(favorite.url)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          window.aether.favorites.showContextMenu(favorite.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 })
        }}
        className="no-drag flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-ink-dim transition-colors hover:bg-white/[0.06]"
      >
        {groupBySpace && space && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hueColor(space.hue, 0.9) }} />
        )}
        <Favicon url={favorite.url} faviconUrl={favorite.faviconUrl} size={12} />
        <span className="max-w-32 fade-truncate">{favorite.title || domainOf(favorite.url)}</span>
      </button>
    </div>
  )
}

/** Pastille de dossier — clic ouvre le popup natif de son contenu (voir
 * `FavoritesBar`). Reste aussi une cible de dépôt directe (déposer un favori
 * sur la pastille fermée le range à la fin de ce dossier). */
function FolderChip({
  folder,
  items,
  expanded,
  isDragOver,
  onToggle,
  onDragOverStart,
  onDragLeaveFolder,
  onDropFavorite
}: {
  folder: FavoriteFolder
  items: Favorite[]
  expanded: boolean
  isDragOver: boolean
  onToggle: (rect: DOMRect) => void
  onDragOverStart: () => void
  onDragLeaveFolder: () => void
  onDropFavorite: (e: DragEvent) => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      // pointerdown + stopPropagation : voir AppMenuButton (TitleBar.tsx) — évite
      // la course avec le handler `pointerdown` global d'App.tsx qui masque le
      // popup à l'appui, ce qui faisait rouvrir la bulle au relâchement du clic.
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        onToggle(e.currentTarget.getBoundingClientRect())
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.aether.favoriteFolders.showContextMenu(folder.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 })
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDragOverStart()
      }}
      onDragLeave={onDragLeaveFolder}
      onDrop={(e) => onDropFavorite(e)}
      title={t('shell.favoritesBar.folderTitle', { name: folder.name, count: items.length })}
      className={cn(
        'no-drag flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-ink-dim transition-colors',
        isDragOver ? 'bg-glacier/20 ring-1 ring-glacier/50' : expanded ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
      )}
    >
      <Folder size={12} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
      <span className="max-w-32 fade-truncate">{folder.name}</span>
      <span className="text-[9px] text-ink-faint/50">{items.length}</span>
    </button>
  )
}

export function FavoritesBar() {
  const t = useT()
  const favorites = useFavoritesStore((s) => s.favorites)
  const folders = useFavoriteFoldersStore((s) => s.folders)
  const activeSpaceId = useSpacesStore((s) => s.activeSpaceId)
  const groupBySpace = useSettingsStore((s) => s.settings?.groupFavoritesBySpace ?? true)

  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [insertion, setInsertion] = useState<Insertion | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [itemWidths, setItemWidths] = useState<Map<string, number>>(new Map())

  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  const visibleToSpace = (f: Favorite): boolean =>
    groupBySpace || f.spaceId === null || f.spaceId === activeSpaceId

  // Mémoïsé : ce filtre/tri ne dépend que de favorites/folders/l'espace/le
  // réglage de groupage — sans ça il recalcule à chaque glisser (insertion,
  // dragOverFolderId...) ou mesure de largeur, bien plus fréquents que ça.
  const { rootFavorites, folderItemsById, entries } = useMemo(() => {
    const rootFavorites = favorites
      .filter((f) => !f.folderId && visibleToSpace(f))
      .sort((a, b) => a.position - b.position)

    const folderItemsById = new Map<string, Favorite[]>()
    for (const folder of folders) {
      folderItemsById.set(
        folder.id,
        favorites.filter((f) => f.folderId === folder.id && visibleToSpace(f)).sort((a, b) => a.position - b.position)
      )
    }

    const entries: Entry[] = [
      ...folders
        .map((folder) => ({ folder, items: folderItemsById.get(folder.id) ?? [] }))
        .filter((g) => groupBySpace || g.items.length > 0)
        .map((g) => ({ kind: 'folder' as const, id: `folder-${g.folder.id}`, folder: g.folder, items: g.items })),
      ...rootFavorites.map((f) => ({ kind: 'favorite' as const, id: `fav-${f.id}`, favorite: f }))
    ]

    return { rootFavorites, folderItemsById, entries }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, folders, activeSpaceId, groupBySpace])

  // Mesure la largeur naturelle de chaque entrée via une rangée cachée
  // identique (même markup) mais non tronquée par `overflow-hidden`.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const widths = new Map<string, number>()
    for (const child of Array.from(el.children)) {
      const key = child.getAttribute('data-key')
      if (key) widths.set(key, (child as HTMLElement).offsetWidth)
    }
    setItemWidths(widths)
  }, [entries.length, favorites, folders])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver((obs) => setAvailableWidth(obs[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Le main a fermé le popup de son propre chef (une page a capté le focus —
  // un clic dans une WebContentsView n'atteint jamais les écouteurs DOM de la
  // fenêtre hôte) : resynchronise l'état local (highlight de la pastille).
  useEffect(() => window.aether.popover.onClosed(() => setExpandedFolderId(null)), [])

  // Si la barre disparaît (réglage désactivé) pendant qu'un popup de dossier
  // est ouvert, le fermer avec elle plutôt que de le laisser orphelin.
  useEffect(() => {
    return () => {
      if (expandedFolderId) window.aether.popover.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  let used = 0
  let visibleCount = entries.length
  for (let i = 0; i < entries.length; i++) {
    const w = itemWidths.get(entries[i].id) ?? 0
    const next = used + w + (i > 0 ? ITEM_GAP : 0)
    const needsChevron = i < entries.length - 1
    if (needsChevron && next + ITEM_GAP + CHEVRON_RESERVE > availableWidth) {
      visibleCount = i
      break
    }
    used = next
  }
  const visibleEntries = entries.slice(0, visibleCount)
  const overflowEntries = entries.slice(visibleCount)

  const showOverflowMenu = (): void => {
    const descriptors: FavoritesOverflowEntry[] = overflowEntries.map((entry) =>
      entry.kind === 'folder' ? { kind: 'folder', id: entry.folder.id } : { kind: 'favorite', id: entry.favorite.id }
    )
    window.aether.favorites.showOverflowMenu(descriptors)
  }

  /** Déplace un favori vers `targetContainer`, à `targetIndex` PRÉCIS dans sa
   * liste (favoris existants du conteneur, hors le favori déplacé). Change
   * aussi son dossier au passage si le conteneur d'origine diffère. */
  const commitMove = async (draggedId: string, targetContainer: Container, targetIndex: number): Promise<void> => {
    const dragged = favorites.find((f) => f.id === draggedId)
    if (!dragged) return
    const targetFolderId = targetContainer === 'root' ? null : targetContainer
    const currentContainer: Container = dragged.folderId ?? 'root'

    const fullTargetList = targetContainer === 'root' ? rootFavorites : folderItemsById.get(targetContainer) ?? []
    // `targetIndex` a été calculé par rapport à la liste COMPLÈTE (favori
    // déplacé toujours dedans, tant que le store n'a pas changé) — le retirer
    // avant insertion décale d'un cran tous les index qui le suivaient : dans
    // le MÊME conteneur, on compense si sa position d'origine précède le point
    // de dépôt (sinon le favori atterrit une case trop loin).
    const draggedOriginalIndex = fullTargetList.findIndex((f) => f.id === draggedId)
    const adjustedTargetIndex =
      currentContainer === targetContainer && draggedOriginalIndex !== -1 && draggedOriginalIndex < targetIndex
        ? targetIndex - 1
        : targetIndex

    const targetList = fullTargetList.filter((f) => f.id !== draggedId)
    const clamped = Math.max(0, Math.min(adjustedTargetIndex, targetList.length))
    const newOrder = [...targetList.slice(0, clamped).map((f) => f.id), draggedId, ...targetList.slice(clamped).map((f) => f.id)]

    if (currentContainer !== targetContainer) {
      await window.aether.favorites.setFolder(draggedId, targetFolderId)
    }
    await window.aether.favorites.reorder(newOrder)
  }

  const onDragStartItem = (): void => setInsertion(null)
  const onDragOverItem = (container: Container, index: number): void => setInsertion({ container, index })
  const onDropItem = (container: Container, index: number, e: DragEvent): void => {
    setInsertion(null)
    const id = e.dataTransfer.getData(DRAG_MIME)
    if (id) void commitMove(id, container, index)
  }

  const dropOnFolder = async (folderId: string, e: DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
    setInsertion(null)
    const id = e.dataTransfer.getData(DRAG_MIME)
    if (id) await commitMove(id, folderId, (folderItemsById.get(folderId) ?? []).length)
  }

  /** Déposer ailleurs que directement sur un favori (zone vide, ou l'interstice
   * entre deux favoris) : insère à la position la plus proche du curseur plutôt
   * que de toujours ranger en fin de liste (voir `nearestContainerIndex`). */
  const dropOnContainerEnd = (container: Container, containerEl: HTMLElement | null, e: DragEvent): void => {
    e.preventDefault()
    setInsertion(null)
    const id = e.dataTransfer.getData(DRAG_MIME)
    if (!id) return
    const list = container === 'root' ? rootFavorites : folderItemsById.get(container) ?? []
    const index = containerEl ? nearestContainerIndex(containerEl, e.clientX, list) : list.length
    void commitMove(id, container, index)
  }

  const dragOverContainer = (container: Container, containerEl: HTMLElement | null, e: DragEvent): void => {
    e.preventDefault()
    if (!containerEl) return
    const list = container === 'root' ? rootFavorites : folderItemsById.get(container) ?? []
    setInsertion({ container, index: nearestContainerIndex(containerEl, e.clientX, list) })
  }

  const renderFavoriteButton = (
    f: Favorite,
    container: Container,
    index: number,
    containerLength: number,
    forMeasure = false
  ): ReactElement => (
    <FavoriteChip
      favorite={f}
      container={container}
      index={index}
      isFirst={index === 0}
      isLast={index === containerLength - 1}
      insertion={insertion}
      onDragStartItem={onDragStartItem}
      onDragOverItem={onDragOverItem}
      onDropItem={onDropItem}
      forMeasure={forMeasure}
    />
  )

  /** Ouvre (ou ferme, si déjà ouvert) le popup natif du contenu de ce dossier,
   * ancré sous sa pastille — voir `FavoritesFolderPopoverCard.tsx`. `items`
   * est déjà connu ICI (le store de cette fenêtre) : le transmettre dans la
   * requête évite au popup d'attendre un aller-retour IPC avant son tout
   * premier rendu (seule vraie source du délai perçu comme trop long face
   * aux autres popups, qui n'ont rien à charger de façon asynchrone). */
  const openFolderPopover = (folder: FavoriteFolder, items: Favorite[], rect: DOMRect): void => {
    if (expandedFolderId === folder.id) {
      setExpandedFolderId(null)
      window.aether.popover.hide()
      return
    }
    window.aether.popover.show({
      kind: 'favorites-folder',
      folderId: folder.id,
      folder,
      items,
      anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      placement: 'below-left'
    })
    setExpandedFolderId(folder.id)
  }

  const renderFolderChip = (folder: FavoriteFolder, items: Favorite[]): ReactElement => (
    <FolderChip
      folder={folder}
      items={items}
      expanded={expandedFolderId === folder.id}
      isDragOver={dragOverFolderId === folder.id}
      onToggle={(rect) => openFolderPopover(folder, items, rect)}
      onDragOverStart={() => setDragOverFolderId(folder.id)}
      onDragLeaveFolder={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
      onDropFavorite={(e) => void dropOnFolder(folder.id, e)}
    />
  )

  const isEmpty = entries.length === 0

  return (
    <div className="flex shrink-0 flex-col border-b hairline bg-void/40">
      <div
        className="drag relative flex h-8 items-center gap-1 px-2"
        onDragOver={(e) => dragOverContainer('root', rowRef.current, e)}
        onDrop={(e) => dropOnContainerEnd('root', rowRef.current, e)}
        onContextMenu={(e) => {
          e.preventDefault()
          window.aether.favorites.showBarContextMenu({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
        }}
      >
        {/* Rangée de mesure invisible : même markup, jamais tronquée, sert à
            calculer combien d'entrées tiennent avant de basculer dans le menu. */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 flex -translate-y-full items-center gap-1 opacity-0"
        >
          {entries.map((entry) => (
            <div key={entry.id} data-key={entry.id}>
              {entry.kind === 'folder'
                ? renderFolderChip(entry.folder, entry.items)
                : renderFavoriteButton(
                    entry.favorite,
                    'root',
                    rootFavorites.findIndex((rf) => rf.id === entry.favorite.id),
                    rootFavorites.length,
                    true
                  )}
            </div>
          ))}
        </div>

        {isEmpty ? (
          <span className="flex flex-1 items-center gap-1.5 text-[10.5px] text-ink-faint/70">
            <Star size={10} strokeWidth={1.7} />
            {t('shell.favoritesBar.emptyHint')}
          </span>
        ) : (
          <div ref={rowRef} className="no-drag flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {visibleEntries.map((entry) => (
              <div key={entry.id}>
                {entry.kind === 'folder'
                  ? renderFolderChip(entry.folder, entry.items)
                  : renderFavoriteButton(
                      entry.favorite,
                      'root',
                      rootFavorites.findIndex((rf) => rf.id === entry.favorite.id),
                      rootFavorites.length
                    )}
              </div>
            ))}
            {overflowEntries.length > 0 && (
              <button
                type="button"
                onClick={showOverflowMenu}
                title={t('shell.favoritesBar.more')}
                className="no-drag ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
              >
                <ChevronDown size={13} strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}

        <div className="mx-0.5 h-4 w-px shrink-0 bg-white/[0.08]" />
        <ManageButton />
      </div>
    </div>
  )
}
