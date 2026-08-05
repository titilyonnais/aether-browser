/**
 * Racine rendue dans la fenêtre popup native (voir src/main/popoverWindow.ts)
 * — même bundle que l'appli principale, chargé avec `?popover=1`. N'affiche
 * que le contenu poussé par le main (infos de site, aperçu d'onglet) et
 * rapporte sa taille réelle pour que le main ajuste la fenêtre en conséquence.
 */
import { useEffect, useRef, useState } from 'react'
import { POPOVER_SAFETY_PX } from '@shared/popoverGeometry'
import type { AppSettings, PopoverBackdrop, PopoverContent } from '@shared/types'
import { AppMenuPopoverCard } from '@/components/chrome/AppMenuPopoverCard'
import { ContextMenuPopoverCard } from '@/components/chrome/ContextMenuPopoverCard'
import { ExtensionsMenuPopoverCard } from '@/components/chrome/ExtensionsMenuPopoverCard'
import { PasswordSavePromptCard } from '@/components/chrome/PasswordSavePromptCard'
import { PasswordSuggestionsPopoverCard } from '@/components/chrome/PasswordSuggestionsPopoverCard'
import { UpdateReadyPopoverCard } from '@/components/chrome/UpdateReadyPopoverCard'
import { WebstoreConfirmCard } from '@/components/chrome/WebstoreConfirmCard'
import { FavoritesFolderPopoverCard } from '@/components/favorites/FavoritesFolderPopoverCard'
import { SiteInfoCard } from '@/components/focus/SiteInfoCard'
import { TabPreviewCard } from '@/components/focus/TabPreviewCard'
import { TranslatePopoverCard } from '@/components/focus/TranslatePopoverCard'
import { applyTheme } from '@/lib/theme'
import { PopoverSurfaceBlur } from './PopoverSurfaceBlur'

/** Réapplique les quelques réglages dont ce contexte JS séparé a besoin —
 * appelé au montage ET à chaque `CH.settingsChanged` (voir plus bas) : sans
 * ce second appel, changer de thème dans Réglages ne se répercutait ici
 * qu'au prochain lancement de l'appli (cette fenêtre popup n'est jamais
 * détruite entre deux usages, donc jamais re-montée pour relire les réglages
 * d'elle-même). */
function applySettingsToDocument(s: AppSettings): void {
  applyTheme(document.documentElement, s.newTabBackground, s.accent, s.accentCustom)
  // Même échelle que la fenêtre principale (Réglages › Apparence), sinon le
  // contenu du popup resterait à 100 % pendant que le reste de l'interface
  // est agrandi/réduit — `reportSize` mesure déjà la taille post-zoom, donc
  // la fenêtre popup s'ajuste automatiquement.
  document.documentElement.style.setProperty('zoom', String(s.uiScale))
}

export default function PopoverRoot() {
  const [content, setContent] = useState<PopoverContent>(null)
  // `null` tant qu'aucune capture n'est encore arrivée pour l'ouverture EN
  // COURS — remis à `null` à chaque nouveau contenu (voir l'effet plus bas) :
  // sans ça, la toute première image d'une bulle DIFFÉRENTE resterait
  // affichée un instant, mal alignée avec la nouvelle carte, le temps que la
  // capture fraîche arrive.
  const [backdrop, setBackdrop] = useState<PopoverBackdrop | null>(null)
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
        setBackdrop(null)
      }),
    []
  )

  useEffect(() => window.aether.popover.onSetBackdrop(setBackdrop), [])

  useEffect(() => {
    void window.aether.settings.get().then((s) => {
      setShowPreview(s.showTabHoverPreview)
      applySettingsToDocument(s)
    })
  }, [])

  // Cette fenêtre n'est JAMAIS remontée entre deux popovers (juste masquée,
  // voir `ensurePopup`/`hidePopoverWindow`) — sans cet abonnement, un
  // changement de thème fait ailleurs (Réglages, fenêtre principale) restait
  // invisible ici jusqu'au prochain lancement de l'appli, signalé par
  // capture utilisateur pour le menu contextuel et « certaines autres » bulles.
  useEffect(
    () =>
      window.aether.settings.onChanged((s) => {
        setShowPreview(s.showTabHoverPreview)
        applySettingsToDocument(s)
      }),
    []
  )

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
    const report = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        window.aether.popover.reportSize({
          width: Math.ceil(rect.width) + POPOVER_SAFETY_PX,
          height: Math.ceil(rect.height) + POPOVER_SAFETY_PX
        })
      }
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()

    // Rend la fenêtre transparente aux clics (les transmet à la page en
    // dessous) tant que le curseur n'est pas sur cette carte — voir
    // `CH.popoverSetIgnoreMouseEvents`. Repart TOUJOURS non-transparente à
    // l'ouverture (`openPopover`, popoverWindow.ts) : le curseur est presque
    // toujours DÉJÀ sur la carte au moment où elle apparaît (menu contextuel
    // ancré au clic, menu ancré au bouton survolé) — un `mouseenter` ne s'y
    // déclencherait jamais puisque rien n'« entre », le curseur y étant déjà.
    // Ce n'est qu'au `mouseleave` (curseur qui s'en va vraiment, évènement
    // fiable) que le clic-à-travers s'active ; `mouseenter` le désactive à
    // nouveau si le curseur revient dessus.
    const onMouseLeave = (): void => window.aether.popover.setIgnoreMouseEvents(true)
    const onMouseEnter = (): void => window.aether.popover.setIgnoreMouseEvents(false)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mouseenter', onMouseEnter)

    return () => {
      ro.disconnect()
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('mouseenter', onMouseEnter)
    }
  }, [content])

  if (!content) return null

  return (
    <div key={contentNonce} ref={rootRef} className="inline-block">
      {content.kind === 'site-info' && (
        <SiteInfoCard pageId={content.pageId} locale={locale} initialInfo={content.initialInfo} />
      )}
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
      {content.kind === 'password-save-prompt' && (
        <PasswordSavePromptCard origin={content.origin} identifier={content.identifier} mode={content.mode} />
      )}
      {content.kind === 'password-suggestions' && (
        <PasswordSuggestionsPopoverCard
          pageId={content.pageId}
          fieldId={content.fieldId}
          pairFieldId={content.pairFieldId}
          entries={content.entries}
        />
      )}
      <PopoverSurfaceBlur containerRef={rootRef} backdrop={backdrop} />
    </div>
  )
}
