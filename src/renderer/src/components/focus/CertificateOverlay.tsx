/**
 * Lecteur de certificat — page complète façon Chrome (onglets Général/
 * Détails, hiérarchie de certificats, export). Remplace l'ancien bloc de
 * texte minimal dans SiteInfoCard.tsx (bulle « informations du site ») —
 * ouvert depuis là via `window.aether.site.showCertificate(pageId)`, relayé
 * par le main jusqu'ici car ce popover tourne dans un process de rendu séparé
 * sans accès au store `ui` (voir le commentaire sur `onCertificateRequested`
 * plus bas).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Download, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CertificateDetail } from '@shared/types'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

export function CertificateOverlay() {
  const open = useUiStore((s) => s.overlay === 'certificate')
  return <AnimatePresence>{open && <CertificatePanel />}</AnimatePresence>
}

function formatDate(epochSeconds: number): string {
  if (!epochSeconds) return '—'
  return new Date(epochSeconds * 1000).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">{label}</span>
      <span className="break-all font-mono text-[12px] text-ink-dim">{value}</span>
    </div>
  )
}

function principalLabel(p: { commonName: string; organization?: string; organizationUnit?: string }): string {
  const parts = [p.commonName]
  if (p.organization) parts.push(p.organization)
  if (p.organizationUnit) parts.push(p.organizationUnit)
  return parts.join(' — ')
}

function GeneralTab({ detail }: { detail: CertificateDetail }) {
  const t = useT()
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('overlays.certificate.issuedTo')} value={principalLabel(detail.subject)} />
        <Field label={t('overlays.certificate.issuedBy')} value={principalLabel(detail.issuer)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('overlays.certificate.validFrom')} value={formatDate(detail.validStart)} />
        <Field label={t('overlays.certificate.validTo')} value={formatDate(detail.validExpiry)} />
      </div>
      <div className="space-y-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          {t('overlays.certificate.fingerprints')}
        </span>
        <Field label={t('overlays.certificate.certificateFingerprint')} value={detail.fingerprint} />
        <Field label={t('overlays.certificate.publicKeyFingerprint')} value={detail.publicKeyFingerprint} />
      </div>
    </div>
  )
}

function DetailsTab({ detail }: { detail: CertificateDetail }) {
  const t = useT()
  // Racine en premier (comme Chrome) — `detail.chain` part du certificat
  // visité (feuille) et remonte vers la racine.
  const chain = [...detail.chain].reverse()
  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          {t('overlays.certificate.chainHeading')}
        </span>
        <div className="space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          {chain.map((link, i) => (
            <div key={i} className="flex items-center gap-2" style={{ paddingLeft: i * 16 }}>
              <ShieldCheck size={12} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
              <span className={cn('truncate text-[12px]', i === chain.length - 1 ? 'text-ink' : 'text-ink-dim')}>
                {link.commonName}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('overlays.certificate.serialNumber')} value={detail.serialNumber} />
        {detail.signatureAlgorithm && (
          <Field label={t('overlays.certificate.signatureAlgorithm')} value={detail.signatureAlgorithm} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('overlays.certificate.issuedTo')} value={principalLabel(detail.subject)} />
        <Field label={t('overlays.certificate.issuedBy')} value={principalLabel(detail.issuer)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('overlays.certificate.validFrom')} value={formatDate(detail.validStart)} />
        <Field label={t('overlays.certificate.validTo')} value={formatDate(detail.validExpiry)} />
      </div>
    </div>
  )
}

function CertificatePanel() {
  const t = useT()
  const pageId = useUiStore((s) => s.certificateTargetPageId)
  const [detail, setDetail] = useState<CertificateDetail | null | undefined>(undefined)
  const [tab, setTab] = useState<'general' | 'details'>('general')
  const close = (): void => useUiStore.getState().closeOverlay()

  useEffect(() => {
    setDetail(undefined)
    if (!pageId) return
    void window.aether.site.certificateDetail(pageId).then(setDetail)
  }, [pageId])

  const exportCert = async (): Promise<void> => {
    if (pageId) await window.aether.site.exportCertificate(pageId)
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
        className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[min(560px,88vh)] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5 py-4">
          <ShieldCheck size={15} strokeWidth={1.7} className="text-glacier" />
          <p className="font-display text-[16px] italic text-ink">{t('overlays.certificate.title')}</p>
          <button
            type="button"
            onClick={close}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
          >
            <X size={15} strokeWidth={1.7} />
          </button>
        </header>

        {detail === undefined ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-ink-faint">
            {t('overlays.certificate.loading')}
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-ink-faint">
            {t('overlays.certificate.unavailable')}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-5 pt-3">
              {(['general', 'details'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-t-lg px-3 py-2 text-[12.5px] transition-colors',
                    tab === id ? 'border-b-2 border-glacier text-ink' : 'text-ink-faint hover:text-ink-dim'
                  )}
                >
                  {id === 'general' ? t('overlays.certificate.tabGeneral') : t('overlays.certificate.tabDetails')}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {tab === 'general' ? <GeneralTab detail={detail} /> : <DetailsTab detail={detail} />}
            </div>
            <footer className="flex shrink-0 justify-end border-t border-white/[0.06] px-5 py-3">
              <button
                type="button"
                onClick={() => void exportCert()}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
              >
                <Download size={12} strokeWidth={1.8} />
                {t('overlays.certificate.export')}
              </button>
            </footer>
          </>
        )}
      </motion.div>
    </>
  )
}
