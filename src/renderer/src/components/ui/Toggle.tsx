/** Interrupteur on/off — utilisé partout où un `<input type="checkbox">` ferait
 * l'affaire fonctionnellement, mais où le style natif ne correspond à rien
 * d'ÆTHER. `label`/`hint` optionnels : une ligne de Réglages les affiche à
 * côté de l'interrupteur ; un usage compact (ex. une ligne de permission déjà
 * pourvue de son propre icône+libellé) peut n'en passer aucun pour n'avoir
 * que le petit interrupteur lui-même. */
import { cn } from '@/lib/utils'

export function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label?: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-3 rounded-lg text-left transition-colors hover:bg-white/[0.02]',
        label || hint ? 'w-full px-1 py-2' : 'shrink-0'
      )}
    >
      {(label || hint) && (
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[12.5px] text-ink-dim">{label}</span>}
          {hint && <span className="block text-[10.5px] text-ink-faint">{hint}</span>}
        </span>
      )}
      <span
        className={cn(
          'flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'justify-end bg-glacier/80' : 'justify-start bg-toggle-track'
        )}
      >
        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white" />
      </span>
    </button>
  )
}
