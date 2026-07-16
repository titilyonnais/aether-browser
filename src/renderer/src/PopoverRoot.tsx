/**
 * Racine rendue dans la fenêtre popup native (voir src/main/popoverWindow.ts)
 * — même bundle que l'appli principale, chargé avec `?popover=1`. N'affiche
 * que le contenu poussé par le main (infos de site, aperçu d'onglet) et
 * rapporte sa taille réelle pour que le main ajuste la fenêtre en conséquence.
 */
import { useEffect, useRef, useState } from 'react'
import type { PopoverContent } from '@shared/types'
import { cn } from '@/lib/utils'
import { AppMenuPopoverCard } from '@/components/chrome/AppMenuPopoverCard'
import { ContextMenuPopoverCard } from '@/components/chrome/ContextMenuPopoverCard'
import { ExtensionsMenuPopoverCard } from '@/components/chrome/ExtensionsMenuPopoverCard'
import { UpdateReadyPopoverCard } from '@/components/chrome/UpdateReadyPopoverCard'
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

  // Neutralise toute transition CSS (ex. `transition-colors` au survol d'une
  // ligne de menu) pendant les ~120ms suivant une nouvelle ouverture — un clic
  // droit atterrit souvent avec le curseur déjà AU-DESSUS d'une ligne : la
  // toute première évaluation de `:hover` par Chromium anime alors base→survol
  // pile pendant que la fenêtre devient visible, se superposant à l'ouverture
  // elle-même (repéré par analyse image par image d'un enregistrement fourni
  // par l'utilisateur : contenu déjà rendu, mais « pop » visible malgré tout).
  // `setTimeout`, pas `requestAnimationFrame` : cette fenêtre reste masquée
  // jusqu'à ce que `report()` (plus bas) confirme sa taille — un rAF peut être
  // fortement retardé par Chromium tant qu'une fenêtre n'est pas composée
  // (déjà la cause d'un bug de latence corrigé précédemment), un minuteur non.
  const [suppressTransitions, setSuppressTransitions] = useState(true)

  useEffect(
    () =>
      window.aether.popover.onSetContent((c) => {
        setContent(c)
        setContentNonce((n) => n + 1)
        setSuppressTransitions(true)
      }),
    []
  )

  useEffect(() => {
    const t = setTimeout(() => setSuppressTransitions(false), 120)
    return () => clearTimeout(t)
  }, [contentNonce])

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
    // Mesure synchrone, sans rAF : cette fenêtre popup reste `show:false` tant
    // que le main n'a pas reçu la taille (cf. popoverWindow.ts) — pour un
    // renderer non composité/masqué, Chromium peut retarder rAF de plusieurs
    // centaines de ms (jusqu'au repli `fallbackShowTimer`), ce qui produisait
    // la latence perçue à l'ouverture. `getBoundingClientRect()` reflète déjà
    // le layout à jour sans attendre un frame peint.
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
    <div
      key={contentNonce}
      ref={rootRef}
      className={cn('inline-block', suppressTransitions && '[&_*]:!transition-none')}
    >
      {content.kind === 'site-info' && <SiteInfoCard pageId={content.pageId} locale={locale} />}
      {content.kind === 'tab-preview' && (
        <TabPreviewCard pageId={content.pageId} showPreview={showPreview} locale={locale} />
      )}
      {content.kind === 'translate' && <TranslatePopoverCard pageId={content.pageId} locale={locale} />}
      {content.kind === 'favorites-folder' && (
        <FavoritesFolderPopoverCard
          folderId={content.folderId}
          initialFolder={content.folder}
          initialItems={content.items}
          locale={locale}
        />
      )}
      {content.kind === 'app-menu' && <AppMenuPopoverCard />}
      {content.kind === 'context-menu' && <ContextMenuPopoverCard title={content.title} rows={content.rows} />}
      {content.kind === 'webstore-confirm' && (
        <WebstoreConfirmCard extensionId={content.extensionId} name={content.name} iconUrl={content.iconUrl} />
      )}
      {content.kind === 'extensions-menu' && <ExtensionsMenuPopoverCard />}
      {content.kind === 'update-ready' && <UpdateReadyPopoverCard version={content.version} />}
    </div>
  )
}
