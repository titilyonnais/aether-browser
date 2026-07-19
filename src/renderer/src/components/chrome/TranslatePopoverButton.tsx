/**
 * Déclencheur « traduire cette page » (barre de titre) — ouvre un popup natif
 * flottant façon Chrome/Brave (langue détectée, choix de langue cible), PAS
 * une bannière insérée dans la page (rejeté explicitement par l'utilisateur :
 * "je ne veux surtout pas ça, ce n'est pas pro"). Même raison que
 * SiteInfoPopover.tsx : une WebContentsView compose toujours au-dessus du DOM.
 */
import { Languages } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PageId } from '@shared/types'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

interface TranslatePopoverButtonProps {
  pageId: PageId
}

export function TranslatePopoverButton({ pageId }: TranslatePopoverButtonProps) {
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
      kind: 'translate',
      pageId,
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      placement: 'below-right'
    })
    setOpen(true)
  }

  // pointerdown + stopPropagation : voir AppMenuButton (TitleBar.tsx) — évite la
  // course avec le handler `pointerdown` global d'App.tsx qui masque le popup à
  // l'appui, ce qui faisait rouvrir le popup au relâchement du clic.
  const toggle = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (open) close()
    else show()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    return () => {
      if (open) window.aether.popover.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  useEffect(() => window.aether.popover.onClosed(() => setOpen(false)), [])

  return (
    <button
      ref={buttonRef}
      type="button"
      title={t('shell.titlebar.translatePage')}
      onPointerDown={toggle}
      className={cn(
        'no-drag grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-150',
        open ? 'bg-white/[0.06] text-glacier' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
      )}
    >
      <Languages size={15} strokeWidth={1.7} />
    </button>
  )
}
