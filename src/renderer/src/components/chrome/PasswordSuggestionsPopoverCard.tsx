/**
 * Suggestion d'autofill cliquable, ancrée sous un champ email/mot de passe
 * de la page — déclenchée depuis le main process (onPasswordFieldFocused,
 * ipc.ts) quand ce champ appartient à une origine pour laquelle des
 * identifiants sont déjà enregistrés. Jamais de mot de passe ici, même
 * masqué — voir `PasswordSuggestion` (shared/types.ts).
 */
import { KeyRound } from 'lucide-react'
import type { PageId, PasswordSuggestion } from '@shared/types'

interface PasswordSuggestionsPopoverCardProps {
  pageId: PageId
  fieldId: string
  pairFieldId: string | null
  entries: PasswordSuggestion[]
}

export function PasswordSuggestionsPopoverCard({
  pageId,
  fieldId,
  pairFieldId,
  entries
}: PasswordSuggestionsPopoverCardProps) {
  const pick = (id: string): void => {
    window.aether.passwords.suggestionSelected({ pageId, fieldId, pairFieldId, id })
  }
  return (
    <div className="popover-surface w-64 overflow-hidden rounded-lg p-1">
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => pick(entry.id)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
        >
          {entry.faviconUrl ? (
            <img src={entry.faviconUrl} width={14} height={14} draggable={false} className="shrink-0 rounded-[3px]" alt="" />
          ) : (
            <KeyRound size={13} strokeWidth={1.7} className="shrink-0 text-ink-faint" />
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{entry.identifierMasked}</span>
        </button>
      ))}
    </div>
  )
}
