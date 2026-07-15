/** Touche clavier stylisée. */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded-[5px] border border-white/[0.09] bg-white/[0.04] px-1.5 py-0.5',
        'font-mono text-[10px] leading-none text-ink-faint',
        className
      )}
    >
      {children}
    </kbd>
  )
}
