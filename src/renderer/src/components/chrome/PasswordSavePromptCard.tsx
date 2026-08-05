/**
 * Popup « Enregistrer ce mot de passe ? » / « Mettre à jour ce mot de
 * passe ? » — déclenché depuis le main process (bridge CDP de détection de
 * formulaire, voir passwordFormBridge.ts/onPasswordSubmitCandidate dans
 * ipc.ts) quand une soumission de connexion est détectée. Le mot de passe
 * lui-même ne transite JAMAIS par ce composant — il reste en mémoire côté
 * main (`pendingPasswordSaves`) jusqu'à la réponse.
 */
import { KeyRound } from 'lucide-react'
import { domainOf } from '@/lib/utils'

interface PasswordSavePromptCardProps {
  origin: string
  identifier: string
  mode: 'create' | 'update'
}

function respond(accepted: boolean): void {
  window.aether.passwords.savePromptRespond(accepted)
}

export function PasswordSavePromptCard({ origin, identifier, mode }: PasswordSavePromptCardProps) {
  const title = mode === 'update' ? 'Mettre à jour ce mot de passe ?' : 'Enregistrer ce mot de passe ?'
  return (
    <div className="popover-surface w-80 rounded-xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <KeyRound size={16} strokeWidth={1.6} className="text-glacier" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{title}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {identifier ? `${identifier} · ` : ''}
            {domainOf(origin)}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond(false)}
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.09]"
        >
          Ignorer
        </button>
        <button
          type="button"
          onClick={() => respond(true)}
          className="flex-1 rounded-lg bg-glacier/90 px-3 py-2 text-[12.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier"
        >
          {mode === 'update' ? 'Mettre à jour' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
