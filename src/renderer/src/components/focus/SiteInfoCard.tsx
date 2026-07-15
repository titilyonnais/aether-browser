/**
 * Contenu de la carte « informations du site » — HTTPS/certificat/permissions.
 * Rendu à l'intérieur de la fenêtre popup native (voir PopoverRoot.tsx) :
 * aucune logique d'ouverture/positionnement ici, seulement le contenu.
 */
import { Camera, Lock, MapPin, ShieldAlert, Unlock } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PageId, SiteInfo, SitePermissionKind, SitePermissionState } from '@shared/types'
import { translate, type Locale } from '@/i18n'

interface SiteInfoCardProps {
  pageId: PageId
  locale: string
}

const PERMISSION_LABELS: Record<SitePermissionKind, { key: string; icon: typeof Camera }> = {
  media: { key: 'focusCanvas.siteInfo.permissionMedia', icon: Camera },
  geolocation: { key: 'focusCanvas.siteInfo.permissionGeolocation', icon: MapPin },
  notifications: { key: 'focusCanvas.siteInfo.permissionNotifications', icon: ShieldAlert }
}

const STATE_KEYS: Record<SitePermissionState, string> = {
  ask: 'focusCanvas.siteInfo.stateAsk',
  allow: 'focusCanvas.siteInfo.stateAllow',
  block: 'focusCanvas.siteInfo.stateBlock'
}

/** Formats de date par langue (BCP47) — approximation de la locale d'interface. */
const DATE_LOCALES: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT'
}

function formatCertDate(epochSeconds: number, locale: string): string {
  if (!epochSeconds) return '—'
  return new Date(epochSeconds * 1000).toLocaleDateString(DATE_LOCALES[locale] ?? 'fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function SiteInfoCard({ pageId, locale }: SiteInfoCardProps) {
  const loc = locale as Locale
  const t = (key: string, vars?: Record<string, string | number>): string => translate(loc, key, vars)
  const [info, setInfo] = useState<SiteInfo | null | undefined>(undefined)
  const [showCert, setShowCert] = useState(false)

  useEffect(() => {
    void window.aether.site.info(pageId).then(setInfo)
  }, [pageId])

  const setPermission = async (kind: SitePermissionKind, state: SitePermissionState): Promise<void> => {
    const next = await window.aether.site.setPermission(pageId, kind, state)
    if (next) setInfo(next)
  }

  if (info === undefined) return null

  return (
    <div className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
      {!info ? (
        <div className="px-3 py-4 text-center text-[11.5px] text-ink-faint">
          {t('focusCanvas.siteInfo.notHttp')}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            {info.isHttps ? (
              <Lock size={15} strokeWidth={1.8} className="shrink-0 text-emerald-300/80" />
            ) : (
              <Unlock size={15} strokeWidth={1.8} className="shrink-0 text-amber-300/80" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[12.5px] text-ink-dim">
                {info.isHttps
                  ? t('focusCanvas.siteInfo.securedConnection')
                  : t('focusCanvas.siteInfo.unsecuredConnection')}
              </p>
              <p className="truncate font-mono text-[10px] text-ink-faint">{info.origin}</p>
            </div>
          </div>

          {info.isHttps && (
            <div className="px-1">
              <button
                type="button"
                onClick={() => setShowCert((v) => !v)}
                className="w-full rounded-lg px-1.5 py-1.5 text-left text-[11px] text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
              >
                {showCert ? t('focusCanvas.siteInfo.hideCert') : t('focusCanvas.siteInfo.showCert')}
              </button>
              {showCert && (
                <div className="mb-1 space-y-1 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[10.5px] text-ink-faint">
                  {info.cert ? (
                    <>
                      <p>
                        <span className="text-ink-faint/70">{t('focusCanvas.siteInfo.issuedFor')}</span>
                        {info.cert.subjectName}
                      </p>
                      <p>
                        <span className="text-ink-faint/70">{t('focusCanvas.siteInfo.issuedBy')}</span>
                        {info.cert.issuerName}
                      </p>
                      <p>
                        <span className="text-ink-faint/70">{t('focusCanvas.siteInfo.validity')}</span>
                        {formatCertDate(info.cert.validStart, locale)} —{' '}
                        {formatCertDate(info.cert.validExpiry, locale)}
                      </p>
                      <p className="truncate font-mono text-[9.5px]">
                        <span className="font-sans text-ink-faint/70">
                          {t('focusCanvas.siteInfo.fingerprint')}
                        </span>
                        {info.cert.fingerprint}
                      </p>
                    </>
                  ) : (
                    <p>{t('focusCanvas.siteInfo.noCertInfo')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="my-1 h-px bg-white/[0.06]" />
          <p className="px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            {t('focusCanvas.siteInfo.permissionsHeading')}
          </p>
          <div className="space-y-0.5 px-1 pb-1">
            {(Object.keys(PERMISSION_LABELS) as SitePermissionKind[]).map((kind) => {
              const { key, icon: Icon } = PERMISSION_LABELS[kind]
              const state = info.permissions[kind]
              return (
                <div key={kind} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                  <Icon size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-dim">{t(key)}</span>
                  <select
                    value={state}
                    onChange={(e) => void setPermission(kind, e.target.value as SitePermissionState)}
                    className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-1 text-[10.5px] text-ink-dim outline-none"
                  >
                    {(Object.keys(STATE_KEYS) as SitePermissionState[]).map((s) => (
                      <option key={s} value={s} className="bg-abyss text-ink-dim">
                        {t(STATE_KEYS[s])}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
