/**
 * Bannière « Google refuse cette connexion » — même patron visuel que
 * DefaultBrowserBanner.tsx, montée globalement (App.tsx). Se déclenche quand
 * le processus main détecte la page de refus explicite de Google (« Ce
 * navigateur ou cette application ne sont peut-être pas sécurisés »,
 * viewManager.ts `checkGoogleSignInBlocked`) : recherché en profondeur cette
 * session, ce blocage repose sur plusieurs signaux qu'aucun réglage de
 * User-Agent ne peut garantir déjoués (voir webSession.ts) — le seul
 * contournement fiable est d'ouvrir la page dans un vrai navigateur système.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function GoogleSignInBlockedBanner() {
  const t = useT()
  const target = useUiStore((s) => s.googleSignInBlocked)
  const clear = useUiStore((s) => s.setGoogleSignInBlocked)

  const openExternally = (): void => {
    if (!target) return
    window.aether.app.openExternal(target.url)
    clear(null)
  }

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-glacier/20 bg-glacier/[0.06] px-5 py-2.5"
        >
          <span className="text-[11.5px] text-ink-dim">{t('googleSignIn.banner.text')}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={openExternally}
              className="flex items-center gap-1.5 rounded-full bg-glacier px-4 py-1.5 text-[11.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier/90"
            >
              <ExternalLink size={11} strokeWidth={2} />
              {t('googleSignIn.banner.openExternal')}
            </button>
            <button
              type="button"
              onClick={() => clear(null)}
              title={t('googleSignIn.banner.dismiss')}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
            >
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
