/**
 * Bannière « Faire d'ÆTHER votre navigateur par défaut » — même patron visuel
 * que la bannière de relance de SettingsOverlay.tsx, mais montée globalement
 * (App.tsx, sous la barre de titre) puisqu'elle doit rester visible quel que
 * soit l'écran affiché, pas seulement dans les réglages.
 *
 * Trois issues, comme Chrome/Edge : « Définir par défaut » (ouvre le
 * sélecteur Windows — voir defaultBrowser.ts, main), « Plus tard » (revient à
 * la prochaine ouverture d'ÆTHER, jamais persisté), et le menu « … » →
 * « Ne plus afficher » (persisté pour de bon, Réglages).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Check, MoreHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/useT'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

export function DefaultBrowserBanner() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const snoozed = useUiStore((s) => s.defaultBrowserBannerSnoozed)
  const snooze = useUiStore((s) => s.snoozeDefaultBrowserBanner)
  const [status, setStatus] = useState<{ isDefault: boolean; available: boolean } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const checkStatus = (): void => {
    void window.aether.app.defaultBrowserStatus().then(setStatus)
  }

  // Vérifié à l'ouverture, puis à chaque fois que la fenêtre reprend le
  // focus — l'utilisateur a pu changer ce réglage depuis Windows PENDANT
  // qu'ÆTHER tournait en arrière-plan (ouvrir Réglages Windows n'implique pas
  // de fermer ÆTHER), la bannière doit disparaître sans attendre un
  // redémarrage.
  useEffect(() => {
    checkStatus()
    const onFocus = (): void => checkStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const dismissForGood = (): void => {
    setMenuOpen(false)
    void patch({ defaultBrowserBannerDismissed: true })
  }

  const visible =
    status !== null &&
    status.available &&
    !status.isDefault &&
    !snoozed &&
    settings !== null &&
    !settings.defaultBrowserBannerDismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-glacier/20 bg-glacier/[0.06] px-5 py-2.5"
        >
          <span className="text-[11.5px] text-ink-dim">{t('defaultBrowser.banner.text')}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => window.aether.app.promptSetDefaultBrowser()}
              className="flex items-center gap-1.5 rounded-full bg-glacier px-4 py-1.5 text-[11.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier/90"
            >
              <Check size={11} strokeWidth={2} />
              {t('defaultBrowser.banner.setDefault')}
            </button>
            <button
              type="button"
              onClick={snooze}
              className="rounded-full px-3 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
            >
              {t('defaultBrowser.banner.later')}
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                title={t('defaultBrowser.banner.moreOptions')}
                onClick={() => setMenuOpen((o) => !o)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
              >
                <MoreHorizontal size={13} strokeWidth={1.8} />
              </button>
              {menuOpen && (
                <div className="popover-surface-dom-blur absolute right-0 top-full z-10 mt-1.5 w-52 overflow-hidden rounded-xl p-1">
                  <button
                    type="button"
                    onClick={dismissForGood}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
                  >
                    <X size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
                    {t('defaultBrowser.banner.dismissForGood')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
