/**
 * Déclencheur « informations du site » — cadenas/globe dans l'en-tête d'une
 * page. Le contenu (HTTPS/certificat/permissions) s'affiche dans une fenêtre
 * popup native flottante (voir src/main/popoverWindow.ts) plutôt qu'en DOM :
 * une WebContentsView de page compose toujours au-dessus du DOM, donc tout
 * popover en overlay HTML y serait invisible là où il chevauche la page.
 */
import { Lock, Unlock } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

  // Récupère les infos AVANT d'ouvrir le popup (pas dans SiteInfoCard une fois
  // affiché) — même technique que la bulle de dossier de favoris : le popup
  // reste caché tant que son contenu n'a pas de taille mesurable, donc un
  // composant qui rend `null` en attendant un aller-retour IPC retarde
  // l'affichage jusqu'au filet de sécurité (500ms). Récupérer la donnée
  // D'ABORD élimine ce délai perçu — le popup s'ouvre déjà complet.
  const show = async (): Promise<void> => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const initialInfo = await window.aether.site.info(pageId)
    window.aether.popover.show({
      kind: 'site-info',
      pageId,
      initialInfo,
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
    else void show()
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
      onPointerDown={toggle}
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
