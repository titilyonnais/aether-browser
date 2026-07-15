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
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ContextMenuRow } from '@shared/types'

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

function Row({ row, onOpenSubmenu }: { row: ContextMenuRow; onOpenSubmenu: (label: string, rows: ContextMenuRow[]) => void }) {
  if (row.kind === 'separator') return <div className="my-1 h-px bg-white/[0.06]" />
  const isSubmenu = row.kind === 'submenu'
  return (
    <button
      type="button"
      disabled={!isSubmenu && row.disabled}
      onClick={() => (isSubmenu ? onOpenSubmenu(row.label, row.rows) : runAction(row.id))}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:enabled:bg-white/[0.07] disabled:opacity-40"
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

export function ContextMenuPopoverCard({ title, rows }: ContextMenuPopoverCardProps) {
  const [stack, setStack] = useState<PanelFrame[]>([])
  const current = stack[stack.length - 1]

  return (
    <div className="popover-surface w-56 overflow-hidden rounded-xl p-1.5">
      {current ? (
        <button
          type="button"
          onClick={() => setStack((s) => s.slice(0, -1))}
          className="mb-1 flex w-full items-center gap-1 rounded-md px-2.5 py-1.5 text-left text-[11.5px] text-ink-faint transition-colors hover:bg-white/[0.07]"
        >
          <ChevronLeft size={13} strokeWidth={2} />
          {current.label}
        </button>
      ) : (
        title && (
          <p className="mb-1 truncate px-2.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint/70">
            {title}
          </p>
        )
      )}
      {(current ? current.rows : rows).map((row, i) => (
        <Row
          key={row.kind === 'separator' ? `sep-${i}` : row.id}
          row={row}
          onOpenSubmenu={(label, subRows) => setStack((s) => [...s, { label, rows: subRows }])}
        />
      ))}
    </div>
  )
}
