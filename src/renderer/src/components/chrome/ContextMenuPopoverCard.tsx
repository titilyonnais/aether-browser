/**
 * Contenu générique du popup natif « menu contextuel » (clic droit sur un
 * favori, un dossier, un onglet, un espace…) — voir PopoverRoot.tsx. Comme
 * AppMenuPopoverCard.tsx : une bulle DOM mesurée précisément (ResizeObserver)
 * plutôt qu'un `Menu.buildFromTemplate` natif dont la largeur réelle ne peut
 * pas être connue avant affichage.
 *
 * `rows` est purement des données sérialisables (voir `ContextMenuRow` dans
 * shared/types) — la vraie action associée à chaque id reste côté main (une
 * map gardée par `showContextMenuPopover`, voir main/ipc.ts), retrouvée via
 * `window.aether.popover.runContextMenuAction(id)`.
 */
import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ContextMenuRow } from '@shared/types'
import { cn } from '@/lib/utils'

interface ContextMenuPopoverCardProps {
  title?: string
  rows: ContextMenuRow[]
}

interface PanelFrame {
  label: string
  rows: ContextMenuRow[]
}

function runAction(id: string): void {
  window.aether.popover.runContextMenuAction(id)
}

function Row({
  row,
  isOpenSubmenu,
  onOpenSubmenu
}: {
  row: ContextMenuRow
  isOpenSubmenu: boolean
  onOpenSubmenu: (label: string, rows: ContextMenuRow[]) => void
}) {
  if (row.kind === 'separator') return <div className="my-1 h-px bg-white/[0.06]" />
  const isSubmenu = row.kind === 'submenu'
  return (
    <button
      type="button"
      disabled={!isSubmenu && row.disabled}
      onClick={() => (isSubmenu ? onOpenSubmenu(row.label, row.rows) : runAction(row.id))}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:enabled:bg-white/[0.07] disabled:opacity-40',
        isSubmenu && isOpenSubmenu && 'bg-white/[0.07]'
      )}
    >
      <span className={row.kind === 'item' && row.danger ? 'truncate text-red-300' : 'truncate text-ink-dim'}>{row.label}</span>
      {isSubmenu ? (
        <ChevronRight size={13} strokeWidth={1.8} className="ml-2 shrink-0 text-ink-faint" />
      ) : row.kind === 'item' && row.checked ? (
        <Check size={13} strokeWidth={2.2} className="ml-2 shrink-0 text-glacier" />
      ) : row.kind === 'item' && row.accelerator ? (
        <span className="ml-3 shrink-0 font-mono text-[10.5px] text-ink-faint">{row.accelerator}</span>
      ) : null}
    </button>
  )
}

function Panel({
  title,
  rows,
  openLabel,
  onOpenSubmenu
}: {
  title?: string
  rows: ContextMenuRow[]
  openLabel: string | null
  onOpenSubmenu: (label: string, subRows: ContextMenuRow[]) => void
}) {
  return (
    <div className="popover-surface w-56 overflow-hidden rounded-xl p-1.5">
      {title && (
        <p className="mb-1 truncate px-2.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint/70">
          {title}
        </p>
      )}
      {rows.map((row, i) => (
        <Row
          key={row.kind === 'separator' ? `sep-${i}` : row.id}
          row={row}
          isOpenSubmenu={row.kind === 'submenu' && row.label === openLabel}
          onOpenSubmenu={onOpenSubmenu}
        />
      ))}
    </div>
  )
}

export function ContextMenuPopoverCard({ title, rows }: ContextMenuPopoverCardProps) {
  // Chaque sous-menu ouvert s'ajoute comme un panneau À CÔTÉ du précédent
  // (façon Chrome), au lieu de remplacer le panneau parent — la pile entière
  // reste visible/cliquable simultanément. Rouvrir le MÊME sous-menu le
  // referme ; en ouvrir un AUTRE au même niveau referme tout ce qui était
  // ouvert plus loin à droite.
  const [stack, setStack] = useState<PanelFrame[]>([])

  const openSubmenuAt = (depth: number, label: string, subRows: ContextMenuRow[]): void => {
    setStack((s) => {
      const base = s.slice(0, depth)
      if (s[depth]?.label === label) return base
      return [...base, { label, rows: subRows }]
    })
  }

  return (
    <div className="flex items-start gap-1.5">
      <Panel title={title} rows={rows} openLabel={stack[0]?.label ?? null} onOpenSubmenu={(l, r) => openSubmenuAt(0, l, r)} />
      {stack.map((frame, depth) => (
        <Panel
          key={depth}
          title={frame.label}
          rows={frame.rows}
          openLabel={stack[depth + 1]?.label ?? null}
          onOpenSubmenu={(l, r) => openSubmenuAt(depth + 1, l, r)}
        />
      ))}
    </div>
  )
}
