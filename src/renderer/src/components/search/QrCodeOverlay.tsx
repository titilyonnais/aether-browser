/**
 * QR code de la page active — généré localement (aucune requête réseau),
 * pour l'ouvrir facilement sur un autre appareil.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Download, QrCode, X } from 'lucide-react'
import QRCodeLib from 'qrcode'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { useUiStore } from '@/stores/ui'

export function QrCodeOverlay() {
  const open = useUiStore((s) => s.overlay === 'qr-code')
  const target = useUiStore((s) => s.qrTarget)
  return <AnimatePresence>{open && target && <QrCodePanel url={target.url} title={target.title} />}</AnimatePresence>
}

function QrCodePanel({ url, title }: { url: string; title: string }) {
  const t = useT()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const close = (): void => {
    useUiStore.getState().closeOverlay()
    useUiStore.getState().setQrTarget(null)
  }

  useEffect(() => {
    let cancelled = false
    void QRCodeLib.toDataURL(url, { width: 240, margin: 1, color: { dark: '#0a0a10', light: '#ffffff' } }).then(
      (d) => {
        if (!cancelled) setDataUrl(d)
      }
    )
    return () => {
      cancelled = true
    }
  }, [url])

  const download = (): void => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'qr-code.png'
    a.click()
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex w-[min(320px,90vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <QrCode size={14} strokeWidth={1.8} className="text-glacier" />
          <p className="min-w-0 flex-1 fade-truncate text-[12.5px] text-ink-dim">{title}</p>
          <button
            type="button"
            onClick={close}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        </header>
        <div className="flex flex-col items-center gap-3 p-6">
          <div className="grid h-[240px] w-[240px] place-items-center rounded-xl bg-white p-3">
            {dataUrl ? (
              <img src={dataUrl} alt={t('overlays.qrCode.altText')} className="h-full w-full" />
            ) : (
              <div className="h-full w-full animate-pulse rounded-lg bg-black/5" />
            )}
          </div>
          <button
            type="button"
            onClick={download}
            disabled={!dataUrl}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink disabled:opacity-50"
          >
            <Download size={12} strokeWidth={1.8} />
            {t('overlays.qrCode.saveImage')}
          </button>
        </div>
      </motion.div>
    </>
  )
}
