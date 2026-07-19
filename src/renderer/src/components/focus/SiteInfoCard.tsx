/**
 * Contenu de la carte « informations du site » — HTTPS/certificat/permissions.
 * Rendu à l'intérieur de la fenêtre popup native (voir PopoverRoot.tsx) :
 * aucune logique d'ouverture/positionnement ici, seulement le contenu.
 */
import { Camera, Lock, MapPin, ShieldAlert, Unlock } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { PageId, SiteInfo, SitePermissionKind, SitePermissionState } from '@shared/types'
import { Select } from '@/components/ui/Select'
import { translate, type Locale } from '@/i18n'

interface SiteInfoCardProps {
  pageId: PageId
  locale: string
  initialInfo: SiteInfo | null
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

export function SiteInfoCard({ pageId, locale, initialInfo }: SiteInfoCardProps) {
  const loc = locale as Locale
  const t = (key: string, vars?: Record<string, string | number>): string => translate(loc, key, vars)
  // Reçu directement à l'ouverture (voir SiteInfoPopover.tsx) — plus d'attente
  // d'un aller-retour IPC après affichage, seule source du délai perçu comme
  // trop long (même précédent que la bulle de dossier de favoris).
  const [info, setInfo] = useState<SiteInfo | null>(initialInfo)
  // Un seul menu de permission ouvert à la fois (comme un `<select>` natif) —
  // nécessaire pour dimensionner correctement la boîte (voir `boxHeight` plus
  // bas) : on ne gère jamais plus d'un panneau flottant en même temps.
  const [openKind, setOpenKind] = useState<SitePermissionKind | null>(null)
  // Bord bas réel du panneau actuellement ouvert (rapporté par `Select` une
  // fois positionné/mesuré), ou `null` si aucun n'est ouvert.
  const [panelBottom, setPanelBottom] = useState<number | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  const escapeRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)

  // Suit la hauteur NATURELLE de la carte visuelle (change avec le contenu :
  // bascule du certificat, etc.) — indépendant de `panelBottom`, qui ne
  // concerne que le débordement éventuel d'un menu de permission ouvert.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const report = (): void => setCardHeight(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const setPermission = async (kind: SitePermissionKind, state: SitePermissionState): Promise<void> => {
    const next = await window.aether.site.setPermission(pageId, kind, state)
    if (next) setInfo(next)
  }

  if (!info) {
    return (
      <div className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
        <div className="px-3 py-4 text-center text-[11.5px] text-ink-faint">
          {t('focusCanvas.siteInfo.notHttp')}
        </div>
      </div>
    )
  }

  return (
    // Racine SANS `overflow-hidden`, hauteur explicite quand un menu de
    // permission déborde de la carte — même principe que le flyout du menu
    // principal (AppMenuPopoverCard.tsx) : un ancêtre `overflow-hidden` (la
    // carte visuelle ci-dessous) ne grandit jamais pour accueillir un
    // descendant qui déborde, et `PopoverRoot.tsx` ne mesure QUE cette racine
    // — sans ça, la fenêtre popup native ne s'agrandirait jamais pour montrer
    // le menu déroulant en entier (il resterait rogné à mi-hauteur).
    <div className="relative" style={{ width: 288, height: panelBottom !== null ? Math.max(cardHeight, panelBottom) : undefined }}>
      <div ref={cardRef} className="popover-surface w-72 overflow-hidden rounded-xl p-1.5">
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
            {/* Ouvre le lecteur de certificat façon Chrome (CertificateOverlay.tsx,
                fenêtre principale) — cette bulle tourne dans un process de rendu
                SÉPARÉ, sans accès aux stores Zustand de la fenêtre principale
                (même limite déjà documentée dans AppMenuPopoverCard.tsx), donc
                relais obligatoire par IPC plutôt qu'un appel direct au store. */}
            <button
              type="button"
              onClick={() => {
                window.aether.site.showCertificate(pageId)
                window.aether.popover.hide()
              }}
              className="w-full rounded-lg px-1.5 py-1.5 text-left text-[11px] text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink-dim"
            >
              {t('focusCanvas.siteInfo.showCert')}
            </button>
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
                <div className="w-28 shrink-0">
                  <Select
                    value={state}
                    onChange={(v) => void setPermission(kind, v as SitePermissionState)}
                    options={(Object.keys(STATE_KEYS) as SitePermissionState[]).map((s) => ({
                      value: s,
                      label: t(STATE_KEYS[s])
                    }))}
                    open={openKind === kind}
                    onOpenChange={(v) => setOpenKind(v ? kind : null)}
                    dropdownContainerRef={escapeRef}
                    onPanelBottomChange={setPanelBottom}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div ref={escapeRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}
