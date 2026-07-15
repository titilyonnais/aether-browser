/**
 * Sélecteur de profil — pastille d'avatar (façon Chrome) qui ouvre le menu
 * natif de bascule de profil (voir main/ipc.ts `CH.profileShowMenu`) : un
 * menu DOM ici serait invisible dès qu'il chevauche une page vivante
 * (`WebContentsView` toujours au-dessus du DOM). Les commandes du menu
 * reviennent via `*Requested` et sont exécutées par les actions habituelles
 * (rechargement complet du workspace), câblées dans `lib/actions.ts`.
 */
import { useRef } from 'react'
import { ProfileAvatar } from '@/components/ui/ProfileAvatar'
import { useT } from '@/i18n/useT'
import { useProfilesStore } from '@/stores/profiles'

export function ProfileSwitcher() {
  const t = useT()
  const profiles = useProfilesStore((s) => s.profiles)
  const activeId = useProfilesStore((s) => s.activeProfileId)
  const active = profiles.find((p) => p.id === activeId) ?? null
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  if (!active) return null

  return (
    <button
      ref={buttonRef}
      type="button"
      title={t('shell.profileSwitcher.title', { name: active.name })}
      onClick={() => {
        const el = buttonRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        window.aether.profiles.showMenu({ x: r.x, y: r.y, width: r.width, height: r.height })
      }}
      className="no-drag rounded-full transition-transform hover:scale-105"
    >
      <ProfileAvatar profile={active} size={28} />
    </button>
  )
}
