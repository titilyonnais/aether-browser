/** Bouton icône sobre — la brique de base de toute la chrome ÆTHER. */
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
  size?: 'sm' | 'md'
  tone?: 'default' | 'danger' | 'lavande'
}

export function IconButton({
  icon: Icon,
  label,
  active = false,
  size = 'md',
  tone = 'default',
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'no-drag grid shrink-0 place-items-center rounded-lg transition-colors duration-150',
        size === 'md' ? 'h-8 w-8' : 'h-7 w-7',
        disabled
          ? 'cursor-default text-ink-faint/40'
          : tone === 'danger'
            ? 'text-ink-faint hover:bg-red-400/10 hover:text-red-200'
            : active
              ? tone === 'lavande'
                ? 'bg-white/[0.06] text-lavande'
                : 'bg-white/[0.06] text-glacier'
              : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim',
        className
      )}
      {...rest}
    >
      <Icon size={size === 'md' ? 15 : 13} strokeWidth={1.7} />
    </button>
  )
}
