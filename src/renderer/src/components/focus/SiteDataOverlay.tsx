/**
 * « Gérer les données des sites sur l'appareil » — overlay dédié (pas un
 * `PopoverContent`, voir SiteInfoCard.tsx) : liste le site principal de la
 * page + les origines intégrées vues depuis sa dernière navigation
 * (`viewManager.ts`'s `embeddedOriginsByPage`, photo 5 : grok.com +
 * m.stripe.com/m.stripe.network), avec suppression par origine.
 * Ouvert depuis la bulle via `window.aether.site.showDataManager(pageId)`,
 * relayé par le main jusqu'ici — même patron que CertificateOverlay.tsx.
 *
 * Menu « 3 points » par ligne : un simple panneau DOM local (PAS le système
 * de popover natif utilisé ailleurs pour les boutons de la barre de titre —
 * cet overlay est déjà une modale plein écran au-dessus de tout, aucune
 * `WebContentsView` ne peut jamais la recouvrir, contrairement à un bouton
 * de chrome flottant à côté d'une page vivante).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Cookie, Globe, MoreVertical, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function SiteDataOverlay() {
  const open = useUiStore((s) => s.overlay === 'site-data')
  return <AnimatePresence>{open && <SiteDataPanel />}</AnimatePresence>
}

function RowMenu({
  cookiesBlocked,
  clearOnExit,
  onToggleCookiesBlocked,
  onToggleClearOnExit
}: {
  cookiesBlocked: boolean
  clearOnExit: boolean
  onToggleCookiesBlocked: () => void
  onToggleClearOnExit: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={t('overlays.siteData.moreActions')}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
      >
        <MoreVertical size={13} strokeWidth={1.8} />
      </button>
      {open && (
        <>
          {/* Recouvre toute la modale pour fermer au clic extérieur — sous le
              panneau (z-10), au-dessus du reste du contenu de l'overlay. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl p-1">
            <button
              type="button"
              onClick={() => {
                onToggleCookiesBlocked()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                {cookiesBlocked && <Check size={12} strokeWidth={2.2} className="text-glacier" />}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-ink-dim">
                {t('overlays.siteData.blockCookies')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleClearOnExit()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                {clearOnExit && <Check size={12} strokeWidth={2.2} className="text-glacier" />}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-ink-dim">
                {t('overlays.siteData.clearOnExit')}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SiteRow({
  origin,
  cookiesBlocked,
  clearOnExit,
  onClear,
  onToggleCookiesBlocked,
  onToggleClearOnExit
}: {
  origin: string
  cookiesBlocked: boolean
  clearOnExit: boolean
  onClear: () => void
  onToggleCookiesBlocked: () => void
  onToggleClearOnExit: () => void
}) {
  const t = useT()
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <Globe size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-dim">{origin}</span>
      <RowMenu
        cookiesBlocked={cookiesBlocked}
        clearOnExit={clearOnExit}
        onToggleCookiesBlocked={onToggleCookiesBlocked}
        onToggleClearOnExit={onToggleClearOnExit}
      />
      <button
        type="button"
        title={t('overlays.siteData.clear')}
        onClick={onClear}
        className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
      >
        <Trash2 size={13} strokeWidth={1.8} />
      </button>
    </div>
  )
}

function SiteDataPanel() {
  const t = useT()
  const target = useUiStore((s) => s.siteDataTarget)
  const [embedded, setEmbedded] = useState<string[]>([])
  const [mainVisible, setMainVisible] = useState(true)
  const [cookiesBlocked, setCookiesBlocked] = useState<Set<string>>(new Set())
  const [clearOnExit, setClearOnExit] = useState<Set<string>>(new Set())
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    setMainVisible(true)
    if (!target) {
      setEmbedded([])
      setCookiesBlocked(new Set())
      setClearOnExit(new Set())
      return
    }
    void window.aether.site.getEmbeddedOrigins(target.pageId).then(setEmbedded)
    void window.aether.sitePermissions.list().then((rows) => {
      setCookiesBlocked(new Set(rows.filter((r) => r.kind === 'cookies' && r.state === 'block').map((r) => r.origin)))
    })
    void window.aether.site.listClearOnExit().then((origins) => setClearOnExit(new Set(origins)))
  }, [target])

  const clear = async (origin: string): Promise<void> => {
    await window.aether.site.clearOriginData(origin)
    useUiStore.getState().toast(t('overlays.siteData.cleared'))
    if (target && origin === target.origin) setMainVisible(false)
    else setEmbedded((prev) => prev.filter((o) => o !== origin))
  }

  const toggleCookiesBlocked = async (origin: string): Promise<void> => {
    const next = !cookiesBlocked.has(origin)
    await window.aether.sitePermissions.set(origin, 'cookies', next ? 'block' : 'ask')
    setCookiesBlocked((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(origin)
      else copy.delete(origin)
      return copy
    })
  }

  const toggleClearOnExitOrigin = async (origin: string): Promise<void> => {
    const next = await window.aether.site.toggleClearOnExit(origin)
    setClearOnExit((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(origin)
      else copy.delete(origin)
      return copy
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={close}
        className="fixed inset-0 z-40 bg-void/55 backdrop-blur-[7px]"
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(480px,88vh)] w-[min(460px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <Cookie size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.siteData.title')}</p>
          <button
            type="button"
            onClick={close}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={15} strokeWidth={1.7} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {target && mainVisible && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                {t('overlays.siteData.mainSite')}
              </span>
              <SiteRow
                origin={target.origin}
                cookiesBlocked={cookiesBlocked.has(target.origin)}
                clearOnExit={clearOnExit.has(target.origin)}
                onClear={() => void clear(target.origin)}
                onToggleCookiesBlocked={() => void toggleCookiesBlocked(target.origin)}
                onToggleClearOnExit={() => void toggleClearOnExitOrigin(target.origin)}
              />
            </div>
          )}

          <div className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
              {t('overlays.siteData.embeddedSites')}
            </span>
            {embedded.length === 0 ? (
              <p className="text-[11.5px] text-ink-faint">{t('overlays.siteData.embeddedEmpty')}</p>
            ) : (
              <div className="space-y-1.5">
                {embedded.map((origin) => (
                  <SiteRow
                    key={origin}
                    origin={origin}
                    cookiesBlocked={cookiesBlocked.has(origin)}
                    clearOnExit={clearOnExit.has(origin)}
                    onClear={() => void clear(origin)}
                    onToggleCookiesBlocked={() => void toggleCookiesBlocked(origin)}
                    onToggleClearOnExit={() => void toggleClearOnExitOrigin(origin)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}
