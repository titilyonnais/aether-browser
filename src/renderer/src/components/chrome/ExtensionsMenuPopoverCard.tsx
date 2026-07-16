/**
 * Contenu du popup natif « extensions » (icône façon Chrome, à côté du bouton
 * de téléchargements dans TitleBar.tsx) — liste compacte des extensions
 * ACTIVÉES pour le profil actif ; cliquer sur l'une d'elles ouvre sa VRAIE
 * bulle (son propre `popup.html`, voir main/extensionPopupWindow.ts), pas un
 * simple affichage ici. Activer/désactiver une extension reste possible dans
 * Réglages › Extensions — volontairement absent d'ici, pour rester une liste
 * de lancement rapide façon Chrome, pas un panneau de gestion. Fenêtre popup
 * séparée (pas de store Zustand partagé) : refetch direct via IPC, même
 * patron que TranslatePopoverCard/ContextMenuPopoverCard.
 */
import { useEffect, useState } from 'react'
import type { ExtensionInfo } from '@shared/types'
import { ExtensionIcon } from '@/components/ui/ExtensionIcon'
import { cn } from '@/lib/utils'

function closePopover(): void {
  window.aether.popover.hide()
}

function manageExtensions(): void {
  window.aether.app.runMenuCommand('extensions')
  closePopover()
}

export function ExtensionsMenuPopoverCard() {
  const [list, setList] = useState<ExtensionInfo[] | null>(null)

  useEffect(() => {
    const reload = (): void => {
      void window.aether.extensions.list().then(setList)
    }
    reload()
    return window.aether.extensions.onInstallResult(() => reload())
  }, [])

  const enabled = list?.filter((ext) => ext.enabled) ?? null

  return (
    <div className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
      <p className="mb-1 truncate px-2.5 pt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint/70">
        Extensions
      </p>
      <div className="max-h-72 overflow-y-auto">
        {enabled === null ? (
          <p className="px-2.5 py-2 text-[11.5px] text-ink-faint">Chargement…</p>
        ) : enabled.length === 0 ? (
          <p className="px-2.5 py-2 text-[11.5px] text-ink-faint">Aucune extension activée.</p>
        ) : (
          enabled.map((ext) => (
            <button
              key={ext.id}
              type="button"
              disabled={!ext.popupUrl}
              title={ext.popupUrl ? undefined : "Cette extension n'a pas de bulle propre."}
              onClick={() => {
                if (!ext.popupUrl) return
                window.aether.extensions.openPopup(ext.id)
                closePopover()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                ext.popupUrl ? 'hover:bg-white/[0.06]' : 'cursor-default'
              )}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.03]">
                <ExtensionIcon iconUrl={ext.iconUrl} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{ext.name || 'Extension'}</span>
            </button>
          ))
        )}
      </div>
      <div className="my-1 h-px bg-white/[0.06]" />
      <button
        type="button"
        onClick={manageExtensions}
        className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink-dim transition-colors hover:bg-white/[0.07]"
      >
        Gérer les extensions
      </button>
    </div>
  )
}
