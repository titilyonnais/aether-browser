/**
 * Barre de titre custom (fenêtre frameless) — zone de préhension,
 * pilule d'intention centrale, bascule Focus/Toile, Muse, contrôles fenêtre.
 * Volontairement rien qui rappelle un navigateur classique.
 */
import {
  CircleHelp,
  Columns2,
  Copy,
  Download,
  Minus,
  MoreVertical,
  Orbit,
  PanelLeft,
  Puzzle,
  Sparkles,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DownloadState } from '@shared/types'
import { Favicon } from '@/components/ui/Favicon'
import { IconButton } from '@/components/ui/IconButton'
import { Kbd } from '@/components/ui/Kbd'
import { ProfileSwitcher } from './ProfileSwitcher'
import { TranslatePopoverButton } from './TranslatePopoverButton'
import { remainingSeconds, useDownloadSpeed } from '@/hooks/useDownloadSpeed'
import { useT } from '@/i18n/useT'
import { getActivePageId } from '@/lib/actions'
import { cn, domainOf, formatBytes, formatDuration } from '@/lib/utils'
import { useDownloadsStore } from '@/stores/downloads'
import { usePagesStore } from '@/stores/pages'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'

export function TitleBar() {
  const t = useT()
  const mode = useUiStore((s) => s.mode)
  const constellationOpen = useUiStore((s) => s.constellationOpen)
  const museOpen = useUiStore((s) => s.museOpen)
  const maximized = useUiStore((s) => s.maximized)
  const activeSpace = useSpacesStore((s) => s.spaces.find((sp) => sp.id === s.activeSpaceId))
  // Abonnement large : la pilule reflète la page active en continu.
  const pages = usePagesStore((s) => s.pages)
  const focusBySpace = usePagesStore((s) => s.focusBySpace)
  void focusBySpace
  const activePage = (() => {
    const id = getActivePageId()
    return id ? (pages[id] ?? null) : null
  })()
  const wideAddressBar = useSettingsStore((s) => s.settings?.wideAddressBar ?? false)
  const neverTranslateDomains = useSettingsStore((s) => s.settings?.neverTranslateDomains ?? [])

  const ui = useUiStore.getState()

  return (
    <header className="drag relative z-30 grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 border-b hairline bg-void/60 px-2">
      {/* Marque + panneau gauche — colonne `1fr` avec `min-w-0` : peut se
          compresser (jusqu'à masquer le nom de l'espace) sans jamais
          chevaucher la pilule centrale, dont l'espace est réservé par la
          grille (contrairement à un overlay `absolute` par-dessus). */}
      <div className="flex min-w-0 items-center gap-1">
        <span className="select-none pl-1.5 pr-1 font-display text-[16px] leading-none text-ink-faint">
          Æ
        </span>
        <IconButton
          icon={PanelLeft}
          label={t('shell.titlebar.constellation')}
          active={constellationOpen}
          onClick={() => ui.toggleConstellation()}
        />
        {activeSpace && (
          <span className="max-w-36 truncate px-1.5 text-xs text-ink-faint">{activeSpace.name}</span>
        )}
      </div>

      {/* Pilule d'intention centrale — colonne `auto`, toujours centrée par
          symétrie des deux colonnes `1fr` adjacentes, jamais superposée. */}
      <button
        type="button"
        onClick={() => ui.openOverlay('intention')}
        className={cn(
          'no-drag flex h-8 min-w-0 items-center gap-2.5 rounded-full',
          // 560px réservés au groupe droit (mesuré ~403px + bouton menu ajouté
          // depuis, jamais compressible) + une marge pour le nom d'espace.
          wideAddressBar ? 'w-[min(980px,calc(100vw-560px))]' : 'w-[min(28rem,calc(100vw-560px))]',
          'border border-white/[0.07] bg-white/[0.03] px-4 text-xs text-ink-faint',
          'transition-all duration-200 hover:border-white/[0.13] hover:bg-white/[0.05] hover:text-ink-dim'
        )}
      >
        {activePage ? (
          <>
            <Favicon url={activePage.url} faviconUrl={activePage.faviconUrl} size={13} />
            <span className="fade-truncate text-ink-dim">
              {activePage.title || domainOf(activePage.url)}
            </span>
            <span className="fade-truncate font-mono text-[10px] text-ink-faint/80">
              {domainOf(activePage.url)}
            </span>
          </>
        ) : (
          <span className="truncate">{t('shell.titlebar.intentionPlaceholder')}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Groupe droit — jamais `min-w-0` : ce sont des contrôles essentiels
          (fenêtre comprise), ils ne doivent jamais rétrécir sous leur taille
          naturelle ni disparaître hors fenêtre. C'est le groupe gauche (nom
          d'espace, moins essentiel) qui absorbe la compression sur une
          fenêtre étroite — voir son `min-w-0` + `truncate` ci-dessus. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Bascule Focus / Toile — libellés explicites, pas seulement des icônes */}
        <div className="no-drag flex shrink-0 items-center rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
          <button
            type="button"
            title={t('shell.titlebar.focusModeTitle')}
            onClick={() => ui.setMode('focus')}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
              mode === 'focus' ? 'bg-white/[0.08] text-glacier' : 'text-ink-faint hover:text-ink-dim'
            )}
          >
            <Columns2 size={12} strokeWidth={1.7} />
            {t('shell.titlebar.focusLabel')}
          </button>
          <button
            type="button"
            title={t('shell.titlebar.canvasModeTitle')}
            onClick={() => ui.setMode('canvas')}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
              mode === 'canvas' ? 'bg-white/[0.08] text-glacier' : 'text-ink-faint hover:text-ink-dim'
            )}
          >
            <Orbit size={12} strokeWidth={1.7} />
            {t('shell.titlebar.canvasLabel')}
          </button>
        </div>

        <IconButton
          icon={CircleHelp}
          label={t('shell.titlebar.guide')}
          onClick={() => ui.openOverlay('guide')}
        />
        <IconButton
          icon={Sparkles}
          label={t('shell.titlebar.muse')}
          active={museOpen}
          tone="lavande"
          onClick={() => ui.toggleMuse()}
        />

        {activePage &&
          /^https?:/.test(activePage.url) &&
          !neverTranslateDomains.includes(domainOf(activePage.url)) && (
            <TranslatePopoverButton pageId={activePage.id} />
          )}

        <ExtensionsButton />

        <DownloadsButton />

        <AppMenuButton />

        <div className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />

        <ProfileSwitcher />

        <div className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />

        {/* Contrôles fenêtre */}
        <IconButton icon={Minus} label={t('shell.titlebar.minimize')} onClick={() => window.aether.window.minimize()} />
        <button
          type="button"
          title={maximized ? t('shell.titlebar.restore') : t('shell.titlebar.maximize')}
          aria-label={maximized ? t('shell.titlebar.restore') : t('shell.titlebar.maximize')}
          onClick={() => window.aether.window.toggleMaximize()}
          className="no-drag grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors duration-150 hover:bg-white/[0.05] hover:text-ink-dim"
        >
          {maximized ? (
            <Copy size={12} strokeWidth={1.6} />
          ) : (
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
              <rect
                x="3.5"
                y="3.5"
                width="9"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          )}
        </button>
        <IconButton icon={X} label={t('shell.titlebar.close')} tone="danger" onClick={() => window.aether.window.close()} />
      </div>
    </header>
  )
}

/** Icône puzzle façon Chrome — n'apparaît que si au moins une extension est
 * chargée pour le profil actif (rien à montrer sinon, contrairement aux
 * téléchargements qui restent utiles à vide). */
function ExtensionsButton() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const refresh = (): void => {
    void window.aether.extensions.list().then((list) => setCount(list.length))
  }

  useEffect(() => {
    refresh()
    return window.aether.extensions.onInstallResult(() => refresh())
  }, [])

  const close = (): void => {
    setOpen(false)
    window.aether.popover.hide()
  }

  const show = (): void => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.aether.popover.show({
      kind: 'extensions-menu',
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      placement: 'below-right'
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => window.aether.popover.onClosed(() => setOpen(false)), [])

  if (count === 0) return null

  return (
    <button
      ref={buttonRef}
      type="button"
      title="Extensions"
      onClick={() => (open ? close() : show())}
      className={cn(
        'no-drag grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-150',
        open ? 'bg-white/[0.06] text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
      )}
    >
      <Puzzle size={15} strokeWidth={1.7} />
    </button>
  )
}

/** Icône de téléchargement — anneau de progression en direct, verdit à la fin. */
function DownloadsButton() {
  const t = useT()
  const entries = useDownloadsStore((s) => s.entries)
  const active = entries.filter((d) => d.state === 'progressing')
  const activeCount = active.length
  // Certains téléchargements n'ont pas de Content-Length (totalBytes = 0) — les
  // exclure du calcul plutôt que de bloquer l'anneau à 0% en permanence ; si
  // AUCUN n'a de taille connue, on bascule en anneau indéterminé (qui tourne).
  const knownTotal = active.filter((d) => d.totalBytes > 0)
  const progress =
    knownTotal.length > 0
      ? knownTotal.reduce((sum, d) => sum + d.receivedBytes / d.totalBytes, 0) / knownTotal.length
      : null

  // Détecte une transition progressing → completed pour un bref éclat vert,
  // sans polluer le store d'un état purement présentationnel.
  const [justCompleted, setJustCompleted] = useState(false)
  const seenStates = useRef(new Map<string, DownloadState>())
  useEffect(() => {
    let completed = false
    for (const d of entries) {
      if (seenStates.current.get(d.id) === 'progressing' && d.state === 'completed') completed = true
      seenStates.current.set(d.id, d.state)
    }
    if (!completed) return
    setJustCompleted(true)
    const t = setTimeout(() => setJustCompleted(false), 2200)
    return () => clearTimeout(t)
  }, [entries])

  const speeds = useDownloadSpeed(entries)

  // Infobulle custom (pas de `title` natif) : une valeur qui change à chaque
  // tick de progression fait scintiller/réinitialiser le tooltip natif du
  // navigateur au lieu de rester stable au survol.
  const [hovering, setHovering] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  useEffect(() => {
    if (!hovering) {
      setShowTooltip(false)
      return
    }
    const t = setTimeout(() => setShowTooltip(true), 500)
    return () => clearTimeout(t)
  }, [hovering])

  const radius = 13
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => useUiStore.getState().openOverlay('downloads')}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          'no-drag relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-150 hover:bg-white/[0.05]',
          justCompleted ? 'text-emerald-300' : activeCount > 0 ? 'text-glacier' : 'text-ink-faint hover:text-ink-dim'
        )}
      >
        {activeCount > 0 && (
          <svg
            className={cn('absolute inset-0 h-full w-full -rotate-90', progress === null && 'animate-spin')}
            viewBox="0 0 32 32"
          >
            <circle cx={16} cy={16} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1.6} />
            <circle
              cx={16}
              cy={16}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeDasharray={progress === null ? `${circumference * 0.25} ${circumference}` : circumference}
              strokeDashoffset={progress === null ? 0 : circumference * (1 - progress)}
              className={progress !== null ? 'transition-[stroke-dashoffset] duration-300' : undefined}
            />
          </svg>
        )}
        <Download size={15} strokeWidth={1.7} />
        {justCompleted && (
          <span className="absolute inset-0 rounded-lg bg-emerald-400/15 animate-pulse-dot" />
        )}
      </button>

      {showTooltip && (
        <div className="popover-surface absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl p-1.5">
          {activeCount === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] text-ink-faint">{t('shell.titlebar.downloadsEmpty')}</p>
          ) : (
            active.map((d) => {
              const remaining = remainingSeconds(d, speeds.get(d.id) ?? 0)
              return (
                <div key={d.id} className="px-2 py-1.5">
                  <p className="truncate text-[11.5px] text-ink">{d.filename}</p>
                  <p className="truncate text-[10px] text-ink-faint">
                    {formatBytes(d.receivedBytes)} / {d.totalBytes > 0 ? formatBytes(d.totalBytes) : '?'}
                    {remaining !== null &&
                      t('shell.titlebar.downloadRemaining', { time: formatDuration(remaining) })}
                  </p>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/** Menu principal (façon Chrome/Edge/Brave) — bulle DOM dans un popup natif
 * flottant (voir AppMenuPopoverCard.tsx), ancrée avec précision sous ce
 * bouton (bord droit contre bord droit) : un menu natif `Menu.buildFromTemplate`
 * ne peut pas être positionné aussi précisément (Electron n'expose aucun
 * moyen d'interroger sa largeur réelle avant affichage). */
function AppMenuButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const close = (): void => {
    setOpen(false)
    window.aether.popover.hide()
  }

  const show = (): void => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.aether.popover.show({
      kind: 'app-menu',
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      placement: 'below-right'
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => window.aether.popover.onClosed(() => setOpen(false)), [])

  return (
    <button
      ref={buttonRef}
      type="button"
      title={t('shell.titlebar.menu')}
      onClick={() => (open ? close() : show())}
      className={cn(
        'no-drag grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-150',
        open ? 'bg-white/[0.06] text-ink-dim' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
      )}
    >
      <MoreVertical size={15} strokeWidth={1.7} />
    </button>
  )
}
