/** Indicateur d'activité discret : un arc qui tourne. */
import { cn } from '@/lib/utils'

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('animate-spin text-glacier/80', className)}
      aria-label="Chargement"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
