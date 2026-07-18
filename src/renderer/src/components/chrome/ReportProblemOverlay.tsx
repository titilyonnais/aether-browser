/**
 * « Signaler un problème » — titre + description envoyés par email au
 * développeur, sans que l'utilisateur ait jamais accès aux identifiants SMTP
 * (ils ne quittent jamais le process main, voir main/mailer.ts). Si l'envoi
 * automatique n'est pas configuré/échoue, repli sur l'ancien lien `mailto:`.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/useT'
import { formatBytes } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const FALLBACK_MAILTO = 'titilyonnais.yt@gmail.com'

export function ReportProblemOverlay() {
  const open = useUiStore((s) => s.overlay === 'report-problem')
  return <AnimatePresence>{open && <ReportProblemPanel />}</AnimatePresence>
}

function ReportProblemPanel() {
  const t = useT()
  const hasSmtpConfig = useSettingsStore((s) => s.settings?.hasSmtpConfig ?? false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<{ path: string; name: string; size: number }[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const titleRef = useRef<HTMLInputElement | null>(null)
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const addAttachments = async (): Promise<void> => {
    const picked = await window.aether.app.chooseReportAttachments()
    if (picked.length === 0) return
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.path))
      return [...prev, ...picked.filter((p) => !seen.has(p.path))].slice(0, 10)
    })
  }

  const removeAttachment = (path: string): void => {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }

  const openMailto = (): void => {
    // Un lien `mailto:` ne peut pas porter de pièces jointes — repli
    // dégradé mais fonctionnel (texte seul) plutôt qu'un échec silencieux.
    const subject = encodeURIComponent(title.trim() || 'Signalement ÆTHER')
    const body = encodeURIComponent(description.trim())
    window.aether.app.openExternal(`mailto:${FALLBACK_MAILTO}?subject=${subject}&body=${body}`)
    close()
  }

  const send = async (): Promise<void> => {
    if (!title.trim() && !description.trim()) return
    if (!hasSmtpConfig) {
      useUiStore.getState().toast(t('overlays.reportProblem.errorFallback'))
      openMailto()
      return
    }
    setStatus('sending')
    const result = await window.aether.app.sendReport(
      title.trim() || 'Signalement ÆTHER',
      description.trim(),
      attachments.map((a) => a.path)
    )
    if (result.ok) {
      setStatus('sent')
      useUiStore.getState().toast(t('overlays.reportProblem.sent'))
      setTimeout(close, 900)
    } else {
      setStatus('idle')
      useUiStore.getState().toast(t('overlays.reportProblem.errorFallback'))
      openMailto()
    }
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 w-[min(480px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-5"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <p className="mb-3 font-display text-[15px] italic text-ink">{t('overlays.reportProblem.title')}</p>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('overlays.reportProblem.titlePlaceholder')}
          maxLength={200}
          className="mb-2.5 h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('overlays.reportProblem.descriptionPlaceholder')}
          maxLength={10_000}
          rows={6}
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-glacier/40"
        />

        {attachments.length > 0 && (
          <div className="mt-2.5 space-y-1">
            {attachments.map((a) => (
              <div
                key={a.path}
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5"
              >
                <Paperclip size={11} strokeWidth={1.7} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-dim">{a.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.path)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-faint hover:bg-white/[0.06] hover:text-ink-dim"
                >
                  <X size={11} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void addAttachments()}
          className="mt-2.5 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:border-glacier/40 hover:text-ink"
        >
          <Paperclip size={11} strokeWidth={1.7} />
          {t('overlays.reportProblem.attach')}
        </button>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[12px] text-ink-faint hover:text-ink-dim"
          >
            {t('overlays.reportProblem.cancel')}
          </button>
          <button
            type="button"
            disabled={status === 'sending'}
            onClick={() => void send()}
            className="rounded-full border border-glacier/30 bg-glacier/[0.08] px-3.5 py-1.5 text-[12px] text-glacier hover:bg-glacier/[0.14] disabled:opacity-50"
          >
            {status === 'sending' ? t('overlays.reportProblem.sending') : t('overlays.reportProblem.send')}
          </button>
        </div>
      </motion.div>
    </>
  )
}
