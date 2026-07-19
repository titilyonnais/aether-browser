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
import { ChevronLeft } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ShortcutCommand } from '@shared/types'
import { cn } from '@/lib/utils'

// Dimensions FIXES du menu principal (doivent correspondre aux classes
// Tailwind ci-dessous : `w-80` = 320px pour le panneau racine, `w-72` = 288px
// pour le flyout, `gap` visuel de 6px entre les deux). La largeur totale
// réservée est CONSTANTE quel que soit l'état du flyout — voir le commentaire
// détaillé dans `AppMenuPopoverCard`. */
const MENU_W = 320
const FLYOUT_W = 288
const FLYOUT_GAP = 6
const TOTAL_W = FLYOUT_W + FLYOUT_GAP + MENU_W

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
  onOpenSubmenu: (panel: Exclude<Panel, 'root'>, rowEl: HTMLButtonElement) => void
}) {
  if ('separator' in row) return <div className="my-1 h-px bg-white/[0.06]" />
  const isOpenSubmenu = row.submenu !== undefined && row.submenu === openPanel
  return (
    <button
      type="button"
      onClick={(e) => {
        if (row.submenu) onOpenSubmenu(row.submenu, e.currentTarget)
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
        <ChevronLeft size={13} strokeWidth={1.8} className="ml-2 shrink-0 text-ink-faint" />
      ) : row.accelerator ? (
        <span className="ml-3 shrink-0 font-mono text-[10.5px] text-ink-faint">{row.accelerator}</span>
      ) : null}
    </button>
  )
}

export function AppMenuPopoverCard() {
  // Flyout ouvert À CÔTÉ du menu racine (façon Chrome), pas un remplacement
  // plein-panneau : cliquer un sous-menu ajoute un second panneau juste à sa
  // gauche, le premier reste visible et cliquable. Un seul niveau ici (aucune
  // ligne de PANELS n'a elle-même de sous-menu) — pas besoin d'une pile.
  const [openPanel, setOpenPanel] = useState<Exclude<Panel, 'root'> | null>(null)
  // Décalage vertical du flyout : haut aligné sur la ligne cliquée (jamais
  // au-dessus du haut du menu, d'où le `max(0, …)`). PAS de borne vers le BAS —
  // un sous-menu bas de liste (« Aide ») a le droit de dépasser sous le menu
  // racine ; c'est `boxHeight` qui agrandit alors la fenêtre vers le bas pour
  // le rendre entièrement visible (voir plus bas).
  const [requestedY, setRequestedY] = useState(0)
  const flyoutTop = Math.max(0, requestedY)
  // Hauteur explicite de la boîte mesurée quand un flyout est ouvert : la plus
  // grande entre le menu racine seul et le BAS du flyout (`flyoutTop + hauteur
  // du flyout`). `null` = pas de flyout → hauteur naturelle (= menu racine).
  const [boxHeight, setBoxHeight] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const flyoutRef = useRef<HTMLDivElement | null>(null)

  const handleOpenSubmenu = (panel: Exclude<Panel, 'root'>, rowEl: HTMLButtonElement): void => {
    if (menuRef.current) {
      setRequestedY(rowEl.getBoundingClientRect().top - menuRef.current.getBoundingClientRect().top)
    }
    setOpenPanel((cur) => (cur === panel ? null : panel))
  }

  // Dimensionne la boîte pour qu'elle CONTIENNE le flyout quand il descend plus
  // bas que le menu racine (« Aide »). Le flyout étant en `position:absolute`
  // (hors flux), il n'étend pas tout seul la boîte : on pose donc une hauteur
  // explicite = max(menu, bas du flyout). Résultat : la fenêtre popup ne grandit
  // que vers le BAS (son haut est épinglé, `naturalY` dans popoverWindow.ts),
  // jamais vers le haut — le menu racine ne bouge donc pas d'un pixel, et le
  // flyout reste aligné sur la ligne cliquée même en dépassant. `useLayoutEffect`
  // mesure et applique AVANT peinture : aucun scintillement. Un flyout haut de
  // liste (« Rechercher et modifier ») rentre dans la hauteur du menu → max =
  // menu → aucune croissance, comportement identique à avant.
  useLayoutEffect(() => {
    if (!openPanel || !menuRef.current || !flyoutRef.current) {
      setBoxHeight(null)
      return
    }
    const menuH = menuRef.current.offsetHeight
    const flyoutH = flyoutRef.current.offsetHeight
    setBoxHeight(Math.max(menuH, Math.max(0, requestedY) + flyoutH))
  }, [openPanel, requestedY])

  return (
    // Boîte à largeur FIXE (`TOTAL_W`) mesurée par PopoverRoot.tsx
    // (ResizeObserver) pour dimensionner la fenêtre popup native. Le flyout est
    // en `position:absolute` — TOTALEMENT hors flux — donc il n'influe JAMAIS
    // sur la LARGEUR (réservée en dur par `TOTAL_W`) : ouvrir/fermer un
    // sous-menu ne peut plus décaler horizontalement la fenêtre (le « saut »
    // latéral corrigé en amont). Les tentatives précédentes le gardaient dans le
    // flux (flex + `opacity`, puis `position:relative`) en pensant figer la
    // mesure — le repositionnement persistait (vérifié image par image) : seul le
    // retrait complet du flux le supprime. La HAUTEUR, elle, est pilotée
    // explicitement par `boxHeight` : normalement celle du menu racine, mais
    // agrandie vers le BAS quand le flyout descend plus bas (« Aide »), pour le
    // rendre entièrement visible SANS remonter le menu (haut épinglé par
    // `naturalY`, popoverWindow.ts) — la fenêtre ne grandit que vers le bas, le
    // menu ne bouge pas. Ancrage à DROITE (`pinnedRightEdge`) : le menu racine
    // reste collé au bord droit sous le bouton "⋯", le flyout s'ouvre vers la
    // gauche où il y a la place.
    <div className="relative" style={{ width: TOTAL_W, height: boxHeight ?? undefined }}>
      {/* Flyout : absolu, calé à gauche. Hors flux, il n'agrandit pas tout seul
          la boîte — c'est `boxHeight` (calculé plus haut) qui l'englobe quand il
          descend sous le menu. `inert` (pas seulement `pointer-events-none`) :
          sans lui, ses boutons resteraient atteignables au clavier (Tab) alors
          qu'ils sont invisibles. */}
      <div
        ref={flyoutRef}
        inert={!openPanel}
        className={cn(
          'absolute left-0 w-72 overflow-hidden rounded-xl transition-opacity duration-100',
          openPanel ? 'popover-surface p-1.5 opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{ top: flyoutTop }}
      >
        {openPanel && (
          <>
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
          </>
        )}
      </div>
      {/* Menu racine : en flux, poussé à DROITE (`ml-auto`), calé en haut de la
          boîte — sa hauteur est le plancher de `boxHeight`. */}
      <div ref={menuRef} className="popover-surface ml-auto w-80 overflow-hidden rounded-xl p-1.5">
        {ROOT.map((row, i) => (
          <MenuRow
            key={'separator' in row ? `sep-${i}` : row.label}
            row={row}
            openPanel={openPanel}
            onOpenSubmenu={handleOpenSubmenu}
          />
        ))}
      </div>
    </div>
  )
}
