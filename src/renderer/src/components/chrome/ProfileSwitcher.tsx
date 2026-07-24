/**
 * Sélecteur de profil — pastille d'avatar qui ouvre une bulle de menu
 * contextuel DOM (glass-strong, comme le reste de l'appli — voir
 * main/ipc.ts `CH.profileShowMenu` → `showContextMenuPopover`), pas un menu
 * natif façon Chrome. Même patron que TranslatePopoverButton.tsx : état
 * `open` local + `onPointerDown`/`stopPropagation` pour piloter nous-mêmes
 * le bascule ouvert/fermé au reclic, sans laisser le détecteur de clic
 * extérieur global d'App.tsx (qui ferme aussi sur CE clic, vu qu'il touche
 * la fenêtre principale) créer une course avec notre propre logique. Les
 * commandes du menu reviennent via `*Requested` et sont exécutées par les
 * actions habituelles (rechargement complet du workspace), câblées dans
 * `lib/actions.ts`.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ProfileAvatar } from '@/components/ui/ProfileAvatar'
import { useT } from '@/i18n/useT'
import { useProfilesStore } from '@/stores/profiles'

export function ProfileSwitcher() {
  const t = useT()
  const profiles = useProfilesStore((s) => s.profiles)
  const activeId = useProfilesStore((s) => s.activeProfileId)
  const active = profiles.find((p) => p.id === activeId) ?? null
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)

  const close = (): void => {
    setOpen(false)
    window.aether.popover.hide()
  }

  const show = (): void => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    window.aether.profiles.showMenu({ x: r.x, y: r.y, width: r.width, height: r.height })
    setOpen(true)
  }

  const toggle = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (open) close()
    else show()
  }

  useEffect(() => window.aether.popover.onClosed(() => setOpen(false)), [])

  if (!active) return null

  return (
    <button
      ref={buttonRef}
      type="button"
      title={t('shell.profileSwitcher.title', { name: active.name })}
      onPointerDown={toggle}
      className="no-drag grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform will-change-transform hover:scale-105"
    >
      <ProfileAvatar profile={active} size={28} />
    </button>
  )
}
