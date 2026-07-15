/**
 * Déclencheur « informations du site » — cadenas/globe dans l'en-tête d'une
 * page. Le contenu (HTTPS/certificat/permissions) s'affiche dans une fenêtre
 * popup native flottante (voir src/main/popoverWindow.ts) plutôt qu'en DOM :
 * une WebContentsView de page compose toujours au-dessus du DOM, donc tout
 * popover en overlay HTML y serait invisible là où il chevauche la page.
 */
import { Lock, Unlock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PageId } from '@shared/types'
import { cn } from '@/lib/utils'

interface SiteInfoPopoverProps {
  pageId: PageId
  url: string
}

export function SiteInfoPopover({ pageId, url }: SiteInfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const isHttps = url.startsWith('https:')
  const isHttpFamily = /^https?:/i.test(url)

  const close = (): void => {
    setOpen(false)
    window.aether.popover.hide()
  }

  const show = (): void => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.aether.popover.show({
      kind: 'site-info',
      pageId,
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

  // Ferme le popup si la page change/se démonte pendant qu'il est ouvert.
  useEffect(() => {
    return () => {
      if (open) window.aether.popover.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // Le main a fermé le popup de son propre chef (clic dans une page — un clic
  // sur une WebContentsView n'atteint jamais notre écouteur pointerdown ci-dessus).
  useEffect(() => window.aether.popover.onClosed(() => setOpen(false)), [])

  return (
    <button
      ref={buttonRef}
      type="button"
      title={!isHttpFamily ? 'Informations du site' : isHttps ? 'Connexion sécurisée' : 'Non sécurisé'}
      onClick={() => (open ? close() : show())}
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/[0.05]',
        !isHttpFamily ? 'text-ink-faint' : isHttps ? 'text-emerald-300/80' : 'text-amber-300/80'
      )}
    >
      {isHttpFamily && !isHttps ? (
        <Unlock size={13} strokeWidth={1.8} />
      ) : (
        <Lock size={13} strokeWidth={1.8} />
      )}
    </button>
  )
}
