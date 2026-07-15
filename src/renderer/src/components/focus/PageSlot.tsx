/**
 * PageSlot — hôte d'une page en mode Focus.
 * L'en-tête (DOM) porte titre, adresse et navigation ; la zone du dessous
 * réserve le rectangle où le main colle la WebContentsView native.
 * Quand un overlay s'ouvre ou en mode Toile, la vue est masquée côté main
 * et l'aperçu capturé prend le relais — d'où des transitions sans couture.
 */
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CloudOff,
  Columns2,
  Compass,
  RefreshCw,
  Rows2,
  Star,
  X
} from 'lucide-react'
import { Favicon } from '@/components/ui/Favicon'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useViewBounds } from '@/hooks/useViewBounds'
import { useT } from '@/i18n/useT'
import { closePage, dismissSlot, duplicateInSplit, toggleFavorite } from '@/lib/actions'
import { cn, domainOf, previewUrl } from '@/lib/utils'
import { useFavoritesStore } from '@/stores/favorites'
import { usePagesStore } from '@/stores/pages'
import { useSpacesStore } from '@/stores/spaces'
import { useUiStore } from '@/stores/ui'
import { FindBar } from './FindBar'
import { NewTabPage } from './NewTabPage'
import { SiteInfoPopover } from './SiteInfoPopover'

interface PageSlotProps {
  pageId: string
  index: number
  /** Plein écran HTML5 (vidéo…) : aucune chrome ÆTHER, la page occupe tout l'écran. */
  fullscreen?: boolean
}

export function PageSlot({ pageId, index, fullscreen = false }: PageSlotProps) {
  const t = useT()
  const page = usePagesStore((s) => s.pages[pageId])
  const isFavorite = useFavoritesStore((s) => (page ? s.favorites.some((f) => f.url === page.url) : false))
  const spaceId = useSpacesStore((s) => s.activeSpaceId)
  const focus = usePagesStore((s) => (spaceId ? (s.focusBySpace[spaceId] ?? null) : null))
  const overlay = useUiStore((s) => s.overlay)
  const mode = useUiStore((s) => s.mode)
  const findBarPageId = useUiStore((s) => s.findBarPageId)

  const slotsCount = focus?.slots.length ?? 1
  const isActive = slotsCount > 1 && (focus?.activeSlot ?? 0) === index
  const isNewTab = Boolean(page && isNewTabUrl(page.url))

  const viewEnabled =
    Boolean(page) && mode === 'focus' && overlay === null && !page?.loadError && !isNewTab
  const boundsRef = useViewBounds(page?.id ?? null, viewEnabled)

  if (!page || !spaceId) return null

  const setActiveSlot = (): void => {
    if (slotsCount > 1) usePagesStore.getState().setFocus(spaceId, { activeSlot: index })
  }

  const toggleOrientation = (): void => {
    const current = focus?.orientation ?? 'h'
    usePagesStore.getState().setFocus(spaceId, { orientation: current === 'h' ? 'v' : 'h' })
  }

  const preview = previewUrl(page.id, page.previewVersion)

  return (
    <section
      onPointerDown={setActiveSlot}
      className="relative flex h-full min-h-0 w-full flex-col"
    >
      {/* En-tête du slot — absente en plein écran HTML5 (aucune chrome ÆTHER). */}
      {!fullscreen && (
      <div className="relative flex h-10 shrink-0 items-center gap-1 px-2">
        {!isNewTab && <Favicon url={page.url} faviconUrl={page.faviconUrl} size={14} className="ml-1.5" />}
        <span className={cn(!isNewTab && 'max-w-[26%] fade-truncate', 'text-xs text-ink-dim')}>
          {isNewTab ? t('focusCanvas.pageSlot.newTabTitle') : page.title || t('focusCanvas.pageSlot.untitled')}
        </span>

        {!isNewTab && (
          <button
            type="button"
            title={page.url}
            onClick={() =>
              useUiStore.getState().openOverlay('intention', { prefill: page.url })
            }
            className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left font-mono text-[10.5px] text-ink-faint transition-colors hover:bg-white/[0.04] hover:text-ink-dim"
          >
            {domainOf(page.url)}
            <span className="text-ink-faint/50">
              {(() => {
                try {
                  const u = new URL(page.url)
                  return (u.pathname === '/' ? '' : u.pathname) + u.search
                } catch {
                  return ''
                }
              })()}
            </span>
          </button>
        )}
        {isNewTab && <span className="min-w-0 flex-1" />}

        {!isNewTab && (
          <>
            <SiteInfoPopover pageId={page.id} url={page.url} />

            <IconButton
              size="sm"
              icon={ArrowLeft}
              label={t('focusCanvas.pageSlot.back')}
              disabled={!page.canGoBack}
              onClick={() => window.aether.pages.back(page.id)}
            />
            <IconButton
              size="sm"
              icon={ArrowRight}
              label={t('focusCanvas.pageSlot.forward')}
              disabled={!page.canGoForward}
              onClick={() => window.aether.pages.forward(page.id)}
            />
            {page.isLoading ? (
              <button
                type="button"
                title={t('focusCanvas.pageSlot.stop')}
                onClick={() => window.aether.pages.stop(page.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint hover:bg-white/[0.05]"
              >
                <Spinner size={12} />
              </button>
            ) : (
              <IconButton
                size="sm"
                icon={RefreshCw}
                label={t('focusCanvas.pageSlot.reload')}
                onClick={() => window.aether.pages.reload(page.id)}
              />
            )}

            <IconButton
              size="sm"
              icon={Star}
              label={isFavorite ? t('focusCanvas.pageSlot.removeFavorite') : t('focusCanvas.pageSlot.addFavorite')}
              active={isFavorite}
              onClick={() => void toggleFavorite(page.id)}
              className={isFavorite ? '!text-amber-300' : undefined}
            />
          </>
        )}

        <div className="mx-0.5 h-3.5 w-px bg-white/[0.07]" />

        {slotsCount === 1 ? (
          <IconButton
            size="sm"
            icon={Columns2}
            label={t('focusCanvas.pageSlot.splitView')}
            onClick={() => void duplicateInSplit(page.id)}
          />
        ) : (
          <IconButton
            size="sm"
            icon={(focus?.orientation ?? 'h') === 'h' ? Rows2 : Columns2}
            label={t('focusCanvas.pageSlot.toggleOrientation')}
            onClick={toggleOrientation}
          />
        )}
        <IconButton
          size="sm"
          icon={ChevronDown}
          label={t('focusCanvas.pageSlot.dismissToCanvas')}
          onClick={() => dismissSlot(index)}
        />
        <IconButton
          size="sm"
          icon={X}
          label={t('focusCanvas.pageSlot.closePage')}
          tone="danger"
          onClick={() => void closePage(page.id)}
        />

        {/* Filet indicateur de slot actif */}
        <div
          className={cn(
            'absolute inset-x-3 bottom-0 h-px transition-opacity duration-300',
            isActive ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(169,201,236,0.45), transparent)'
          }}
        />
        {/* Barre de chargement */}
        {page.isLoading && (
          <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden">
            <div
              className="h-full w-1/3 animate-shimmer"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(169,201,236,0.8), transparent)'
              }}
            />
          </div>
        )}
      </div>
      )}

      {!fullscreen && findBarPageId === page.id && <FindBar pageId={page.id} />}

      {/* Zone web : la vue native se colle sur ce rectangle. */}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden bg-abyss',
          fullscreen ? '' : 'm-1.5 mt-0 rounded-lg border hairline'
        )}
      >
        {isNewTab ? (
          <NewTabPage pageId={page.id} />
        ) : (
          <>
        {preview && (
          <img
            src={preview}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover object-top"
            alt=""
          />
        )}
        {!preview && !page.loadError && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Favicon url={page.url} faviconUrl={page.faviconUrl} size={28} />
              <p className="font-mono text-[11px] text-ink-faint">{domainOf(page.url)}</p>
              {page.isLoading && <Spinner size={16} />}
            </div>
          </div>
        )}

        {page.loadError ? (
          isChromeScheme(page.url) ? (
            <div className="absolute inset-0 grid place-items-center bg-abyss/95 px-6">
              <div className="flex max-w-md flex-col items-center gap-4 text-center">
                <Compass size={22} strokeWidth={1.4} className="text-ink-faint" />
                <div>
                  <p className="text-[13px] text-ink-dim">
                    <span className="font-mono">{page.url}</span>{' '}
                    {t('focusCanvas.pageSlot.chromeSchemeSuffix')}
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                    {t('focusCanvas.pageSlot.chromeSchemeExplainerPart1')}{' '}
                    <span className="font-mono">chrome://flags</span>{' '}
                    {t('focusCanvas.pageSlot.chromeSchemeExplainerPart2')}{' '}
                    <span className="font-mono">chrome://settings</span>{' '}
                    {t('focusCanvas.pageSlot.chromeSchemeExplainerPart3')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => useUiStore.getState().openOverlay('guide')}
                  className="rounded-full border border-glacier/30 bg-glacier/[0.06] px-4 py-1.5 text-xs text-glacier transition-colors hover:bg-glacier/[0.12]"
                >
                  {t('focusCanvas.pageSlot.chromeSchemeAction')}
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-abyss/90">
              <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                <CloudOff size={22} strokeWidth={1.4} className="text-ink-faint" />
                <div>
                  <p className="text-[13px] text-ink-dim">{t('focusCanvas.pageSlot.loadErrorTitle')}</p>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-faint">{page.loadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.aether.pages.reload(page.id)}
                  className="rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
                >
                  {t('focusCanvas.pageSlot.retry')}
                </button>
              </div>
            </div>
          )
        ) : (
          <div ref={boundsRef} className="absolute inset-0" />
        )}
          </>
        )}
      </div>
    </section>
  )
}

/** Une page interne du moteur (chrome://…, view-source:…). */
function isChromeScheme(url: string): boolean {
  return /^(chrome|view-source):/i.test(url)
}

/** Page de nouvel onglet intégrée — rendue en composant React (NewTabPage),
 * jamais dans une vraie WebContentsView (voir ViewManager.ensureLive). */
function isNewTabUrl(url: string): boolean {
  return url.startsWith('aether://newtab')
}
