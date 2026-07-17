/**
 * Contenu du popup natif « menu principal » (façon Chrome/Edge/Brave) — voir
 * AppMenuButton (TitleBar.tsx) et PopoverRoot.tsx. Rendu dans la fenêtre
 * popup, PAS un `Menu.buildFromTemplate` natif : impossible de positionner un
 * menu natif avec précision (Electron n'expose aucun moyen d'interroger sa
 * largeur réelle avant affichage — plusieurs tentatives d'estimation se sont
 * révélées peu fiables, voir la mémoire du projet). Une bulle DOM mesure sa
 * vraie taille (ResizeObserver dans PopoverRoot.tsx) et se positionne
 * exactement — même mécanisme que la bulle de dossier de favoris.
 *
 * Chaque action relaie une commande déjà gérée par `runCommand` côté fenêtre
 * principale (même relais que les raccourcis clavier globaux) via
 * `window.aether.app.runMenuCommand` — cette fenêtre popup n'a pas accès aux
 * stores Zustand de la fenêtre principale (process de rendu séparé).
 */
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ShortcutCommand } from '@shared/types'
import { cn } from '@/lib/utils'

type Panel = 'root' | 'editAndFind' | 'castAndShare' | 'moreTools' | 'zoom' | 'help'

interface Item {
  label: string
  accelerator?: string
  action?: ShortcutCommand
  submenu?: Exclude<Panel, 'root'>
  onClick?: () => void
}

type Row = Item | { separator: true }

function closePopover(): void {
  window.aether.popover.hide()
}

function run(cmd: ShortcutCommand): void {
  window.aether.app.runMenuCommand(cmd)
  closePopover()
}

const ROOT: Row[] = [
  { label: 'Nouvel onglet', accelerator: 'Ctrl+K', action: 'intention' },
  { label: 'Nouvelle fenêtre', accelerator: 'Ctrl+N', action: 'new-window' },
  { label: 'Navigation privée', accelerator: 'Ctrl+Maj+N', action: 'private-window' },
  { separator: true },
  { label: 'Favoris et listes', action: 'favorites-manage' },
  { label: 'Historique', action: 'history' },
  { label: 'Téléchargements', action: 'downloads' },
  { label: 'Extensions', action: 'extensions' },
  { separator: true },
  { label: 'Rechercher et modifier', submenu: 'editAndFind' },
  { label: 'Caster et partager', submenu: 'castAndShare' },
  { label: 'Plus d’outils', submenu: 'moreTools' },
  { separator: true },
  { label: 'Supprimer les données de navigation…', accelerator: 'Ctrl+Maj+Suppr', action: 'clear-data' },
  { separator: true },
  { label: 'Zoom', submenu: 'zoom' },
  { label: 'Imprimer…', accelerator: 'Ctrl+P', action: 'print' },
  { separator: true },
  { label: 'Aide', submenu: 'help' },
  { label: 'Paramètres', accelerator: 'Ctrl+,', action: 'settings' },
  { separator: true },
  {
    label: 'Quitter ÆTHER',
    onClick: () => {
      window.aether.app.quit()
      closePopover()
    }
  }
]

const PANELS: Record<Exclude<Panel, 'root'>, { title: string; rows: Row[] }> = {
  editAndFind: {
    title: 'Rechercher et modifier',
    rows: [
      { label: 'Rechercher dans la page', accelerator: 'Ctrl+F', action: 'find-in-page' },
      { separator: true },
      { label: 'Copier', accelerator: 'Ctrl+C', action: 'copy' },
      { label: 'Coller', accelerator: 'Ctrl+V', action: 'paste' },
      { label: 'Couper', accelerator: 'Ctrl+X', action: 'cut' }
    ]
  },
  castAndShare: {
    title: 'Caster et partager',
    rows: [
      { label: 'Enregistrer la page sous…', accelerator: 'Ctrl+S', action: 'save-page' },
      { label: 'Traduire cette page', action: 'translate-page' },
      { label: 'Copier le lien', action: 'copy-link' },
      { label: 'Créer un QR code', action: 'qr-code' },
      { label: 'Capture d’écran', action: 'screenshot' }
    ]
  },
  moreTools: {
    title: 'Plus d’outils',
    rows: [
      { label: 'Recherche dans les onglets', accelerator: 'Ctrl+Maj+A', action: 'tab-search' },
      { label: 'Nommer la fenêtre', action: 'rename-window' },
      { label: 'Personnaliser ÆTHER', action: 'customize-theme' },
      { separator: true },
      { label: 'Performances', action: 'performance-settings' },
      { label: 'Gestionnaire de tâches', action: 'task-manager' },
      { separator: true },
      { label: 'Outils de développement', accelerator: 'F12', action: 'devtools' }
    ]
  },
  zoom: {
    title: 'Zoom',
    rows: [
      { label: 'Zoom arrière', accelerator: 'Ctrl+-', action: 'zoom-out' },
      { label: 'Réinitialiser le zoom', accelerator: 'Ctrl+0', action: 'zoom-reset' },
      { label: 'Zoom avant', accelerator: 'Ctrl+=', action: 'zoom-in' },
      { separator: true },
      { label: 'Plein écran', accelerator: 'F11', action: 'fullscreen' }
    ]
  },
  help: {
    title: 'Aide',
    rows: [
      { label: 'À propos d’ÆTHER', action: 'about' },
      { label: 'Centre d’aide', accelerator: 'F1', action: 'guide' },
      { label: 'Signaler un problème…', action: 'report-problem' }
    ]
  }
}

function MenuRow({
  row,
  openPanel,
  onOpenSubmenu
}: {
  row: Row
  openPanel: Exclude<Panel, 'root'> | null
  onOpenSubmenu: (panel: Exclude<Panel, 'root'>) => void
}) {
  if ('separator' in row) return <div className="my-1 h-px bg-white/[0.06]" />
  const isOpenSubmenu = row.submenu !== undefined && row.submenu === openPanel
  return (
    <button
      type="button"
      onClick={() => {
        if (row.submenu) onOpenSubmenu(row.submenu)
        else if (row.onClick) row.onClick()
        else if (row.action) run(row.action)
      }}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.07]',
        isOpenSubmenu && 'bg-white/[0.07]'
      )}
    >
      <span className="truncate">{row.label}</span>
      {row.submenu ? (
        <ChevronRight size={13} strokeWidth={1.8} className="ml-2 shrink-0 text-ink-faint" />
      ) : row.accelerator ? (
        <span className="ml-3 shrink-0 font-mono text-[10.5px] text-ink-faint">{row.accelerator}</span>
      ) : null}
    </button>
  )
}

export function AppMenuPopoverCard() {
  // Flyout ouvert À CÔTÉ du menu racine (façon Chrome), pas un remplacement
  // plein-panneau : cliquer un sous-menu ajoute un second panneau juste à sa
  // droite, le premier reste visible et cliquable. Un seul niveau ici (aucune
  // ligne de PANELS n'a elle-même de sous-menu) — pas besoin d'une pile.
  const [openPanel, setOpenPanel] = useState<Exclude<Panel, 'root'> | null>(null)

  return (
    <div className="flex items-start gap-1.5">
      <div className="popover-surface w-80 overflow-hidden rounded-xl p-1.5">
        {ROOT.map((row, i) => (
          <MenuRow
            key={'separator' in row ? `sep-${i}` : row.label}
            row={row}
            openPanel={openPanel}
            onOpenSubmenu={(p) => setOpenPanel((cur) => (cur === p ? null : p))}
          />
        ))}
      </div>
      {openPanel && (
        <div className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
          <p className="mb-1 truncate px-2.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint/70">
            {PANELS[openPanel].title}
          </p>
          {PANELS[openPanel].rows.map((row, i) => (
            <MenuRow
              key={'separator' in row ? `sep-${i}` : row.label}
              row={row}
              openPanel={null}
              onOpenSubmenu={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}
