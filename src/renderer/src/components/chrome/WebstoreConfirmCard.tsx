/**
 * Popup de confirmation avant une installation depuis le Chrome Web Store —
 * déclenchée soit par le vrai bouton de Google (intercepté via le shim
 * chrome.webstorePrivate, voir WEBSTORE_HOOK_SCRIPT dans viewManager.ts), soit
 * par le bouton flottant de secours ÆTHER. Volontairement dans l'esprit de la
 * vraie boîte de dialogue de Chrome (icône, nom, avertissement générique,
 * Ajouter/Annuler) — mais ce n'est PAS cette boîte de dialogue native (hors de
 * portée sans forker Chromium), donc rendue ici comme toute autre bulle ÆTHER.
 */
import { Puzzle } from 'lucide-react'

interface WebstoreConfirmCardProps {
  extensionId: string
  name: string
  iconUrl: string | null
}

function respond(confirmed: boolean): void {
  window.aether.popover.confirmWebstoreInstall(confirmed)
}

export function WebstoreConfirmCard({ name, iconUrl }: WebstoreConfirmCardProps) {
  return (
    <div className="popover-surface w-80 rounded-xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Puzzle size={16} strokeWidth={1.6} className="text-ink-faint" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">Ajouter « {name} » ?</p>
          <p className="text-[11px] text-ink-faint">Chrome Web Store</p>
        </div>
      </div>

      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-dim">
        Cette extension peut lire et modifier des données sur les sites que vous visitez. ÆTHER ne vérifie pas la
        sécurité des extensions du Store — n&rsquo;installez que celles dont vous faites confiance à l&rsquo;auteur.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond(false)}
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.09]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => respond(true)}
          className="flex-1 rounded-lg bg-glacier/90 px-3 py-2 text-[12.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier"
        >
          Ajouter l&rsquo;extension
        </button>
      </div>
    </div>
  )
}
