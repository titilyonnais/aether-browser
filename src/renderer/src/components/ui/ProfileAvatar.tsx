/** Avatar d'un profil : image importée, icône+fond, ou initiale nue. */
import type { Profile } from '@shared/types'
import { hueColor } from '@/lib/utils'

export function ProfileAvatar({ profile, size }: { profile: Profile; size: number }) {
  if (profile.avatarKind === 'image' && profile.avatarImage) {
    return (
      <img
        src={`aether://avatars/${profile.avatarImage}`}
        width={size}
        height={size}
        draggable={false}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        alt=""
      />
    )
  }
  if (profile.avatarKind === 'icon') {
    const color = profile.avatarColor || hueColor(profile.hue, 1, 80)
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          background: profile.avatarColor ? `${profile.avatarColor}29` : hueColor(profile.hue, 0.16, 40),
          color
        }}
      >
        {profile.avatarIcon || profile.name.charAt(0).toUpperCase()}
      </span>
    )
  }
  // 'none' : initiale nue, discrète.
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-white/15 text-ink-faint"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {profile.name.charAt(0).toUpperCase()}
    </span>
  )
}
