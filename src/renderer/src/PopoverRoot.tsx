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

  // Cette fenêtre popup est délibérément un peu plus GRANDE que la carte
  // visible : marge anti-rognage (`SAFETY_PX` plus bas) et, pour le menu
  // principal, largeur réservée pour qu'un flyout puisse s'ouvrir sans jamais
  // redimensionner la fenêtre (toujours allouée, même flyout fermé — voir
  // AppMenuPopoverCard.tsx). Cette marge invisible fait néanmoins partie de la
  // fenêtre NATIVE, qui passe AU-DESSUS de la fenêtre principale : un clic
  // dedans atteint cette fenêtre popup (`transparent:true` ne la rend pas
  // insensible aux clics) et n'atteint donc JAMAIS le détecteur global de
  // clic-extérieur d'App.tsx (posé sur la fenêtre PRINCIPALE) — d'où une
  // « zone morte » où fermer semblait ne rien faire, obligeant à cliquer loin
  // de la bulle. Fix : on ferme nous-mêmes dès qu'un clic ne touche aucune
  // carte VISIBLE. `.popover-surface` est la classe de cette carte dans TOUS
  // les types de popover — un repère plus fiable que les bornes de `rootRef`,
  // qui pour le menu principal couvre AUSSI la largeur réservée du flyout
  // (invisible quand fermé, mais toujours « dans » `rootRef`).
  // `elementsFromPoint` traverse la pile empilée sous le curseur (y compris
  // les éléments à `pointer-events:none`) : aucune carte visible → marge.
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const hitCard = document
        .elementsFromPoint(e.clientX, e.clientY)
        .some((el) => el.classList.contains('popover-surface'))
      if (!hitCard) window.aether.popover.hide()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
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
    // `SAFETY_PX` ajouté à la hauteur mesurée (pas juste au guess initial,
    // cf. ipc.ts) : vérifié par capture vidéo que même la mesure RÉELLE
    // (post-ResizeObserver, donc déjà appliquée à la fenêtre) laissait le
    // coin arrondi du BAS de `.popover-surface` rogné net — le contenu texte
    // n'était pas coupé, seuls les derniers pixels (padding + rayon de bordure)
    // manquaient. `getBoundingClientRect()` mesure en pixels CSS ; sur un
    // facteur d'échelle Windows non entier (125 %, 150 %…), l'arrondi vers les
    // pixels physiques appliqué par `BrowserWindow.setBounds()` peut tronquer
    // vers le bas au lieu d'arrondir au-dessus — quelques pixels de marge
    // absorbent cet écart (et tout autre écart de sous-pixel similaire) sans
    // aucun risque : la fenêtre est intégralement transparente, l'espace en
    // trop est invisible.
    const SAFETY_PX = 8
    const report = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        window.aether.popover.reportSize({
          width: Math.ceil(rect.width) + SAFETY_PX,
          height: Math.ceil(rect.height) + SAFETY_PX
        })
      }
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [content])

  if (!content) return null

  return (
    <div key={contentNonce} ref={rootRef} className="inline-block">
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
