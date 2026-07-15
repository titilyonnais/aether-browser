/**
 * Recherche compacte en deux morceaux : `SearchToggle` (icône loupe dans un
 * en-tête) + `SearchBar` (rangée PLEINE LARGEUR qui se déplie juste en
 * dessous au clic, animation hauteur/fondu). Split plutôt qu'un seul champ
 * qui s'élargit sur place : dans un en-tête étroit (titre + boutons), un
 * champ qui grandit horizontalement n'a nulle part où grandir — une rangée
 * dédiée en pleine largeur du panneau reste lisible même avec un placeholder
 * long ("Rechercher dans l'historique…").
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SearchToggleProps {
  open: boolean
  onToggle: () => void
  title: string
}

export function SearchToggle({ open, onToggle, title }: SearchToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors',
        open ? 'bg-white/[0.06] text-ink-dim' : 'text-ink-faint hover:bg-white/[0.05] hover:text-ink-dim'
      )}
    >
      <Search size={14} strokeWidth={1.7} />
    </button>
  )
}

interface SearchBarProps {
  open: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
}

export function SearchBar({ open, value, onChange, placeholder }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          className="shrink-0 overflow-hidden border-b border-white/[0.06]"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 transition-colors focus-within:bg-glacier/[0.04]">
            <Search size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onChange('')
              }}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
