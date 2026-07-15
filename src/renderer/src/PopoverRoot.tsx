/**
 * Racine rendue dans la fenêtre popup native (voir src/main/popoverWindow.ts)
 * — même bundle que l'appli principale, chargé avec `?popover=1`. N'affiche
 * que le contenu poussé par le main (infos de site, aperçu d'onglet) et
 * rapporte sa taille réelle pour que le main ajuste la fenêtre en conséquence.
 */
import { useEffect, useRef, useState } from 'react'
import type { PopoverContent } from '@shared/types'
import { AppMenuPopoverCard } from '@/components/chrome/AppMenuPopoverCard'
import { ContextMenuPopoverCard } from '@/components/chrome/ContextMenuPopoverCard'
import { ExtensionsMenuPopoverCard } from '@/components/chrome/ExtensionsMenuPopoverCard'
import { WebstoreConfirmCard } from '@/components/chrome/WebstoreConfirmCard'
import { FavoritesFolderPopoverCard } from '@/components/favorites/FavoritesFolderPopoverCard'
import { SiteInfoCard } from '@/components/focus/SiteInfoCard'
import { TabPreviewCard } from '@/components/focus/TabPreviewCard'
import { TranslatePopoverCard } from '@/components/focus/TranslatePopoverCard'

export default function PopoverRoot() {
  const [content, setContent] = useState<PopoverContent>(null)
  // Incrémenté à CHAQUE contenu poussé (donc à chaque ouverture, même du même
  // genre de popover) — sert de `key` React pour forcer un vrai remontage.
  // Sans ça, rouvrir le menu principal (ou un menu contextuel) après avoir
  // navigué dans un sous-menu le rouvrait bloqué sur ce sous-menu : la fenêtre
  // popup n'est que masquée (`hide()`, jamais détruite) entre deux ouvertures,
  // donc son arbre React — et l'état local `panel`/`stack` du sous-menu —
  // survivait d'une ouverture à l'autre tant que le TYPE de composant rendu
  // ne changeait pas.
  const [contentNonce, setContentNonce] = useState(0)
  // Cette fenêtre n'a pas de store partagé avec la fenêtre principale (contexte
  // JS séparé) — le seul réglage nécessaire ici est lu directement à la demande.
  const [showPreview, setShowPreview] = useState(true)
  const locale = 'fr'
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(
    () =>
      window.aether.popover.onSetContent((c) => {
        setContent(c)
        setContentNonce((n) => n + 1)
      }),
    []
  )

  useEffect(() => {
    void window.aether.settings.get().then((s) => {
      setShowPreview(s.showTabHoverPreview)
      // Pas de store partagé avec la fenêtre principale (contexte JS séparé) —
      // sans ça `.popover-surface`/`.glass` resteraient bloqués sur le thème
      // sombre par défaut de `:root`, même si l'utilisateur est en thème clair.
      document.documentElement.dataset.theme = s.theme
      // Même échelle que la fenêtre principale (Réglages › Apparence), sinon
      // le contenu du popup resterait à 100 % pendant que le reste de
      // l'interface est agrandi/réduit — `reportSize` (plus bas) mesure déjà
      // la taille post-zoom, donc la fenêtre popup s'ajuste automatiquement.
      document.documentElement.style.setProperty('zoom', String(s.uiScale))
    })
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const report = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        window.aether.popover.reportSize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) })
      }
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [content])

  if (!content) return null

  return (
    <div ref={rootRef} className="inline-block">
      {content.kind === 'site-info' && <SiteInfoCard key={contentNonce} pageId={content.pageId} locale={locale} />}
      {content.kind === 'tab-preview' && (
        <TabPreviewCard key={contentNonce} pageId={content.pageId} showPreview={showPreview} locale={locale} />
      )}
      {content.kind === 'translate' && <TranslatePopoverCard key={contentNonce} pageId={content.pageId} locale={locale} />}
      {content.kind === 'favorites-folder' && (
        <FavoritesFolderPopoverCard
          key={contentNonce}
          folderId={content.folderId}
          initialFolder={content.folder}
          initialItems={content.items}
          locale={locale}
        />
      )}
      {content.kind === 'app-menu' && <AppMenuPopoverCard key={contentNonce} />}
      {content.kind === 'context-menu' && (
        <ContextMenuPopoverCard key={contentNonce} title={content.title} rows={content.rows} />
      )}
      {content.kind === 'webstore-confirm' && (
        <WebstoreConfirmCard
          key={contentNonce}
          extensionId={content.extensionId}
          name={content.name}
          iconUrl={content.iconUrl}
        />
      )}
      {content.kind === 'extensions-menu' && <ExtensionsMenuPopoverCard key={contentNonce} />}
    </div>
  )
}
