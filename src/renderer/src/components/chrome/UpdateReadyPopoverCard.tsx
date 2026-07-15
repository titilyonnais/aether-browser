/**
 * Bulle non intrusive « mise à jour prête » — déclenchée par `UpdateReadyButton`
 * (TitleBar.tsx), visible seulement une fois une mise à jour réellement
 * téléchargée (voir main/updater.ts). Un simple bouton « Redémarrer » ou
 * fermer — pas d'installation sans ce clic explicite.
 */
function closePopover(): void {
  window.aether.popover.hide()
}

export function UpdateReadyPopoverCard({ version }: { version: string }) {
  return (
    <div className="popover-surface w-72 rounded-xl p-4">
      <p className="mb-1 text-[13px] font-medium text-ink">Mise à jour disponible</p>
      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-dim">
        La version {version} d&rsquo;ÆTHER est téléchargée et prête à installer.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={closePopover}
          className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-[12.5px] text-ink-dim transition-colors hover:bg-white/[0.09]"
        >
          Plus tard
        </button>
        <button
          type="button"
          onClick={() => window.aether.updates.install()}
          className="flex-1 rounded-lg bg-glacier/90 px-3 py-2 text-[12.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier"
        >
          Redémarrer
        </button>
      </div>
    </div>
  )
}
