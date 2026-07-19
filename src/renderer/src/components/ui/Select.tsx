/**
 * Menu déroulant custom : la liste native `<option>` d'un `<select>` est
 * rendue par l'OS (fond noir/surbrillance bleue Windows par défaut, cf.
 * capture utilisateur) — impossible à styler en CSS dans Chromium, quoi
 * qu'on tente sur `<option>`. Une vraie liste DOM (bouton + panneau) reste
 * intégralement au style ÆTHER. Partagé entre Réglages (usage simple, panneau
 * en enfant local `position:absolute`) et le popover « informations du site »
 * (nécessite `dropdownContainerRef`, voir plus bas).
 */
import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useOverflowFade } from '@/hooks/useOverflowFade'
import { cn } from '@/lib/utils'

const fadeMaskStyle = {
  maskImage: 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)'
}

/** Une ligne d'option — extraite en composant à part entière car le fondu
 * conditionnel (`useOverflowFade`) est un Hook : l'appeler directement dans le
 * `.map()` du panneau violerait les règles des Hooks (nombre d'appels variable
 * selon le nombre d'options). Un composant par ligne, lui, appelle le Hook une
 * fois par instance — toujours valide. */
function SelectOption({
  label,
  selected,
  onClick
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  const fade = useOverflowFade<HTMLSpanElement>([label])
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors',
        selected ? 'bg-glacier/15 text-glacier' : 'text-ink-dim hover:bg-white/[0.05] hover:text-ink'
      )}
    >
      <span
        ref={fade.ref}
        className="min-w-0 overflow-hidden whitespace-nowrap"
        style={fade.overflowing ? fadeMaskStyle : undefined}
      >
        {label}
      </span>
      {selected && <Check size={13} strokeWidth={2} className="shrink-0" />}
    </button>
  )
}

export function Select({
  value,
  onChange,
  options,
  dropdownContainerRef,
  open: controlledOpen,
  onOpenChange,
  onPanelBottomChange
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  /** Fourni uniquement quand le panneau doit échapper à un ancêtre
   * `overflow-hidden` qui ne grandit jamais pour l'accueillir (ex. le popover
   * « informations du site », dont la fenêtre native est dimensionnée par
   * mesure du contenu — voir SiteInfoCard.tsx). Le panneau est alors téléporté
   * dans ce conteneur via un portail et positionné de façon impérative. Sans
   * cette prop, comportement inchangé (panneau `absolute` local). */
  dropdownContainerRef?: RefObject<HTMLElement | null>
  /** État ouvert/fermé contrôlé par le parent (ex. SiteInfoCard, qui a besoin
   * de savoir laquelle de PLUSIEURS listes est ouverte pour dimensionner son
   * propre popover). Non fourni → état local (usage Réglages, indépendant). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Uniquement avec `dropdownContainerRef` : rapporte le bord bas réel du
   * panneau ouvert (coordonnées locales au conteneur cible), ou `null` une
   * fois fermé — permet au parent de dimensionner sa propre boîte pour que le
   * panneau ne soit jamais rogné (voir SiteInfoCard.tsx). */
  onPanelBottomChange?: (bottom: number | null) => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = (v: boolean): void => {
    if (onOpenChange) onOpenChange(v)
    else setLocalOpen(v)
  }
  const triggerWrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  const triggerFade = useOverflowFade<HTMLSpanElement>([current?.label])

  // Position imposée au panneau téléporté (portail) — calculée depuis les
  // bornes réelles du déclencheur relatives au conteneur cible, puisque le
  // positionnement CSS relatif à l'ancêtre local ne s'applique plus une fois
  // le panneau déplacé ailleurs dans l'arbre DOM par `createPortal`.
  const [portalStyle, setPortalStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !dropdownContainerRef?.current || !triggerWrapRef.current) return
    const triggerRect = triggerWrapRef.current.getBoundingClientRect()
    const containerRect = dropdownContainerRef.current.getBoundingClientRect()
    setPortalStyle({
      top: triggerRect.bottom - containerRect.top + 4,
      left: triggerRect.left - containerRect.left,
      width: triggerRect.width
    })
  }, [open, dropdownContainerRef])

  // Rapporte le bord bas réel du panneau (position + hauteur mesurée) une fois
  // positionné — `ResizeObserver` plutôt qu'une mesure ponctuelle : le nombre
  // d'options peut varier d'un appelant à l'autre, robuste à tout changement.
  // Effet séparé de la remise à `null` (ci-dessous) : ce dernier ne doit
  // s'exécuter qu'à la fermeture/démontage réels, pas à chaque recalcul de
  // `portalStyle` pendant que le panneau reste ouvert (sinon un bref
  // null-puis-valeur à chaque frame de repositionnement).
  useEffect(() => {
    if (!open || !dropdownContainerRef || !onPanelBottomChange) return
    if (!portalStyle || !panelRef.current) return
    const el = panelRef.current
    const report = (): void => onPanelBottomChange(portalStyle.top + el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portalStyle])

  useEffect(() => {
    if (open || !dropdownContainerRef || !onPanelBottomChange) return
    onPanelBottomChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      // Deux zones valides : le déclencheur lui-même, ET le panneau — qui,
      // une fois téléporté par le portail, n'est PLUS un descendant du
      // wrapper du déclencheur. Sans ce second test, cliquer une option serait
      // à tort traité comme un clic extérieur (le panneau se fermerait avant
      // que le `onClick` de l'option n'ait pu s'exécuter).
      if (triggerWrapRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const panel = (
    <div
      ref={panelRef}
      role="listbox"
      className={cn(
        'glass-strong pointer-events-auto z-10 max-h-60 overflow-y-auto rounded-lg p-1',
        dropdownContainerRef ? 'absolute' : 'absolute left-0 right-0 top-[calc(100%+4px)]'
      )}
      style={dropdownContainerRef ? (portalStyle ?? { visibility: 'hidden' }) : undefined}
    >
      {options.map((o) => (
        <SelectOption
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onClick={() => {
            onChange(o.value)
            setOpen(false)
          }}
        />
      ))}
    </div>
  )

  return (
    <div ref={triggerWrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] text-ink outline-none transition-colors hover:bg-white/[0.05] focus:border-glacier/40"
      >
        <span
          ref={triggerFade.ref}
          className="min-w-0 overflow-hidden whitespace-nowrap"
          style={triggerFade.overflowing ? fadeMaskStyle : undefined}
        >
          {current?.label ?? ''}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          className={cn('shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (dropdownContainerRef?.current ? createPortal(panel, dropdownContainerRef.current) : panel)}
    </div>
  )
}
