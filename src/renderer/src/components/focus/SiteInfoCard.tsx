/**
 * Contenu de la carte « informations du site » — HTTPS/certificat/permissions.
 * Rendu à l'intérieur de la fenêtre popup native (voir PopoverRoot.tsx) :
 * aucune logique d'ouverture/positionnement ici, seulement le contenu.
 *
 * Pile de vues INTERNE (racine / détail connexion / détail cookies) — même
 * bulle, mêmes dimensions de base, seul le contenu change (comme demandé :
 * « je veux que la bulle ne change pas mais tout le texte si »). Le
 * redimensionnement automatique du popup (`PopoverRoot.tsx`, `ResizeObserver`
 * sur la racine mesurée) réagit à N'IMPORTE QUEL changement de contenu, pas
 * seulement à l'ouverture d'un menu — changer de vue fonctionne donc sans
 * aucune mécanique supplémentaire. Contrairement à la version précédente
 * (menu déroulant `Select` par permission), les lignes utilisent un simple
 * `Toggle` + expansion EN FLUX (jamais de panneau flottant) : plus besoin de
 * l'architecture « racine sans overflow-hidden + hauteur explicite » qui
 * servait uniquement à laisser un `Select` déborder sans être rogné.
 */
import {
  ChevronLeft,
  ChevronRight,
  Cookie,
  ExternalLink,
  Lock,
  Unlock,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PageId, SiteInfo, SitePermissionKind, SitePermissionState } from '@shared/types'
import { Toggle } from '@/components/ui/Toggle'
import { translate, type Locale } from '@/i18n'
import { PERMISSION_LABELS } from '@/lib/sitePermissionLabels'

interface SiteInfoCardProps {
  pageId: PageId
  locale: string
  initialInfo: SiteInfo | null
}

type View = { kind: 'root' } | { kind: 'security-detail' } | { kind: 'cookies-detail' }

function close(): void {
  window.aether.popover.hide()
}

/** En-tête des vues de détail — flèche de retour + titre + croix de fermeture
 * (contrairement à la racine, dont l'en-tête est l'origine elle-même). */
function DetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5">
      <button
        type="button"
        onClick={onBack}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
      </button>
      <span className="min-w-0 flex-1 truncate px-1 text-[12.5px] font-medium text-ink">{title}</span>
      <button
        type="button"
        onClick={close}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
      >
        <X size={15} strokeWidth={1.7} />
      </button>
    </div>
  )
}

function ChevronRow({
  icon: Icon,
  label,
  onClick
}: {
  icon: typeof Cookie
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
    >
      <Icon size={15} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-dim">{label}</span>
      <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
    </button>
  )
}

function PermissionRow({
  kind,
  state,
  expanded,
  onToggleExpand,
  onChange,
  onReset,
  t
}: {
  kind: SitePermissionKind
  state: SitePermissionState
  expanded: boolean
  onToggleExpand: () => void
  onChange: (v: boolean) => void
  onReset: () => void
  t: (key: string) => string
}) {
  const { key, icon: Icon } = PERMISSION_LABELS[kind]
  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <Icon size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-ink-dim">{t(key)}</span>
          <span className="block truncate text-[10px] text-ink-faint">{t('focusCanvas.siteInfo.recentlyUsed')}</span>
        </span>
        <Toggle checked={state === 'allow'} onChange={onChange} />
        <ChevronRight
          size={13}
          strokeWidth={1.8}
          className={`shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-2.5 pb-2">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-center text-[11.5px] text-ink-dim transition-colors hover:border-glacier/40 hover:text-ink"
          >
            {t('focusCanvas.siteInfo.resetPermission')}
          </button>
        </div>
      )}
    </div>
  )
}

export function SiteInfoCard({ pageId, locale, initialInfo }: SiteInfoCardProps) {
  const loc = locale as Locale
  const t = (key: string, vars?: Record<string, string | number>): string => translate(loc, key, vars)
  // Reçu directement à l'ouverture (voir SiteInfoPopover.tsx) — plus d'attente
  // d'un aller-retour IPC après affichage (même précédent que la bulle de
  // dossier de favoris).
  const [info, setInfo] = useState<SiteInfo | null>(initialInfo)
  const [view, setView] = useState<View>({ kind: 'root' })
  const [expandedKind, setExpandedKind] = useState<SitePermissionKind | null>(null)
  // Nombre d'origines exactes (sous-domaines compris) ayant des cookies sous
  // ce domaine — chargé à la demande, seulement quand la vue cookies s'ouvre.
  const [groupOriginCount, setGroupOriginCount] = useState<number | null>(null)

  const setPermission = async (kind: SitePermissionKind, state: SitePermissionState): Promise<void> => {
    const next = await window.aether.site.setPermission(pageId, kind, state)
    if (next) setInfo(next)
  }

  useEffect(() => {
    if (view.kind !== 'cookies-detail' || !info) return
    setGroupOriginCount(null)
    void window.aether.siteRegistry.detail(info.origin).then((g) => setGroupOriginCount(g?.origins.length ?? 0))
  }, [view.kind, info])

  if (!info) {
    return (
      <div className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
        <div className="px-3 py-4 text-center text-[11.5px] text-ink-faint">
          {t('focusCanvas.siteInfo.notHttp')}
        </div>
      </div>
    )
  }

  if (view.kind === 'security-detail') {
    return (
      <div className="popover-surface w-80 overflow-hidden rounded-xl">
        <DetailHeader title={t('focusCanvas.siteInfo.securedConnection')} onBack={() => setView({ kind: 'root' })} />
        <div className="px-3.5 pb-3.5">
          <div className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] p-2.5">
            {info.isHttps ? (
              <Lock size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-emerald-300/80" />
            ) : (
              <Unlock size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-amber-300/80" />
            )}
            <div className="min-w-0 space-y-1.5">
              <p className="text-[12.5px] font-medium text-ink">
                {info.isHttps
                  ? t('focusCanvas.siteInfo.securedConnection')
                  : t('focusCanvas.siteInfo.unsecuredConnection')}
              </p>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {info.isHttps
                  ? t('focusCanvas.siteInfo.securityDetailBody')
                  : t('focusCanvas.siteInfo.securityDetailBodyInsecure')}
              </p>
              {info.isHttps && (
                <button
                  type="button"
                  onClick={() => window.aether.site.showCertificate(pageId)}
                  className="text-[11px] text-glacier hover:underline"
                >
                  {t('focusCanvas.siteInfo.learnMore')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view.kind === 'cookies-detail') {
    return (
      <div className="popover-surface w-80 overflow-hidden rounded-xl">
        <DetailHeader
          title={t('focusCanvas.siteInfo.cookiesAndSiteData')}
          onBack={() => setView({ kind: 'root' })}
        />
        <div className="space-y-2.5 px-3.5 pb-3.5">
          <p className="text-[11px] leading-relaxed text-ink-faint">{t('focusCanvas.siteInfo.cookiesDetailBody')}</p>
          <ChevronRow
            icon={Cookie}
            label={t('focusCanvas.siteInfo.manageDeviceData')}
            onClick={() => window.aether.site.showDataManager(pageId)}
          />
          {groupOriginCount !== null && groupOriginCount > 0 && (
            <p className="px-2.5 text-[11px] text-ink-faint">
              {t(
                groupOriginCount === 1
                  ? 'focusCanvas.siteInfo.sitesAllowedCount_one'
                  : 'focusCanvas.siteInfo.sitesAllowedCount_other',
                { count: groupOriginCount }
              )}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="popover-surface w-80 overflow-hidden rounded-xl p-1.5">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="min-w-0 flex-1 truncate px-1.5 text-[12.5px] font-medium text-ink">{info.origin}</span>
        <button
          type="button"
          onClick={close}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
        >
          <X size={15} strokeWidth={1.7} />
        </button>
      </div>

      <ChevronRow
        icon={info.isHttps ? Lock : Unlock}
        label={info.isHttps ? t('focusCanvas.siteInfo.securedConnection') : t('focusCanvas.siteInfo.unsecuredConnection')}
        onClick={() => setView({ kind: 'security-detail' })}
      />

      {info.usedKinds.length > 0 && (
        <>
          <div className="mx-2.5 my-1 h-px bg-white/[0.06]" />
          {info.usedKinds.map((kind) => (
            <PermissionRow
              key={kind}
              kind={kind}
              state={info.permissions[kind]}
              expanded={expandedKind === kind}
              onToggleExpand={() => setExpandedKind((cur) => (cur === kind ? null : kind))}
              onChange={(v) => void setPermission(kind, v ? 'allow' : 'block')}
              onReset={() => void setPermission(kind, 'ask')}
              t={t}
            />
          ))}
        </>
      )}

      <div className="mx-2.5 my-1 h-px bg-white/[0.06]" />
      <ChevronRow
        icon={Cookie}
        label={t('focusCanvas.siteInfo.cookiesAndSiteData')}
        onClick={() => setView({ kind: 'cookies-detail' })}
      />
      <button
        type="button"
        onClick={() => window.aether.site.showSiteSettings(pageId)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-dim">{t('focusCanvas.siteInfo.siteSettings')}</span>
        <ExternalLink size={13} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
      </button>
    </div>
  )
}
