/**
 * « Gérer les données des sites sur l'appareil » — overlay dédié (pas un
 * `PopoverContent`, voir SiteInfoCard.tsx) : liste le site principal de la
 * page + les origines intégrées vues depuis sa dernière navigation
 * (`viewManager.ts`'s `embeddedOriginsByPage`, photo 5 : grok.com +
 * m.stripe.com/m.stripe.network), avec suppression par origine.
 * Ouvert depuis la bulle via `window.aether.site.showDataManager(pageId)`,
 * relayé par le main jusqu'ici — même patron que CertificateOverlay.tsx.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Cookie, Globe, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function SiteDataOverlay() {
  const open = useUiStore((s) => s.overlay === 'site-data')
  return <AnimatePresence>{open && <SiteDataPanel />}</AnimatePresence>
}

function SiteRow({ origin, onClear }: { origin: string; onClear: () => void }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <Globe size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-dim">{origin}</span>
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
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    setMainVisible(true)
    if (!target) {
      setEmbedded([])
      return
    }
    void window.aether.site.getEmbeddedOrigins(target.pageId).then(setEmbedded)
  }, [target])

  const clear = async (origin: string): Promise<void> => {
    await window.aether.site.clearOriginData(origin)
    useUiStore.getState().toast(t('overlays.siteData.cleared'))
    if (target && origin === target.origin) setMainVisible(false)
    else setEmbedded((prev) => prev.filter((o) => o !== origin))
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
              <SiteRow origin={target.origin} onClear={() => void clear(target.origin)} />
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
                  <SiteRow key={origin} origin={origin} onClear={() => void clear(origin)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}
