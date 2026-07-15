/**
 * Interrupteur compact, SANS libellé englobant — contrairement au `Toggle` de
 * SettingsOverlay.tsx (un `<button>` `w-full` pensé pour une ligne de réglage
 * entière cliquable), celui-ci ne couvre que sa propre taille fixe. À utiliser
 * partout où le libellé cliquable est un élément SÉPARÉ à côté (ex. une ligne
 * de liste où seul l'interrupteur doit réagir au clic, pas toute la ligne).
 */
import { cn } from '@/lib/utils'

interface MiniSwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
}

export function MiniSwitch({ checked, onChange }: MiniSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        // Alignement flex (justify-start/end) plutôt qu'un thumb absolu + translate :
        // pas de calcul de décalage à faire soi-même, donc pas de calcul à rater.
        'flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
        checked ? 'justify-end bg-glacier/80' : 'justify-start bg-toggle-track'
      )}
    >
      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white" />
    </button>
  )
}
