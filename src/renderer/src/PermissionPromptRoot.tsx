/**
 * Racine rendue dans la fenêtre native de l'invite de permission (voir
 * src/main/permissionPromptWindow.ts) — même bundle que l'appli principale,
 * chargé avec `?permission-prompt=1`. Fenêtre SÉPARÉE du système de popover
 * partagé (PopoverRoot.tsx) : voir le commentaire en tête de
 * permissionPromptWindow.ts pour le pourquoi (cycle de vie différent —
 * survit à un clic dans la page, doit toujours résoudre un callback Electron
 * en attente).
 */
import { Camera, Clipboard, FileText, MapPin, Mic, Music, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PermissionPromptContent, SitePermissionKind } from '@shared/types'
import { translate } from '@/i18n'

// Seuls les kinds réellement « promptables » (déclenchés via
// `setPermissionRequestHandler`, voir webSession.ts) atteignent cette fenêtre
// — `Partial` + repli plutôt qu'un `Record` exhaustif sur les 15 catégories,
// dont la majorité (cookies, images…) ne passe jamais par une invite.
const ICONS: Partial<Record<SitePermissionKind, typeof Camera>> = {
  media: Camera,
  camera: Camera,
  microphone: Mic,
  geolocation: MapPin,
  notifications: ShieldAlert,
  midi: Music,
  clipboard: Clipboard,
  fileSystem: FileText
}
const MESSAGE_KEYS: Partial<Record<SitePermissionKind, string>> = {
  media: 'focusCanvas.permissionPrompt.wantsMedia',
  camera: 'focusCanvas.permissionPrompt.wantsCamera',
  microphone: 'focusCanvas.permissionPrompt.wantsMicrophone',
  geolocation: 'focusCanvas.permissionPrompt.wantsGeolocation',
  notifications: 'focusCanvas.permissionPrompt.wantsNotifications',
  midi: 'focusCanvas.permissionPrompt.wantsMidi',
  clipboard: 'focusCanvas.permissionPrompt.wantsClipboard',
  fileSystem: 'focusCanvas.permissionPrompt.wantsFileSystem'
}

export default function PermissionPromptRoot() {
  const [content, setContent] = useState<PermissionPromptContent | null>(null)
  // Pas de store partagé avec la fenêtre principale (contexte JS séparé) —
  // langue d'interface fixe pour l'instant, comme PopoverRoot.tsx.
  const locale = 'fr'
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => window.aether.permissionPrompt.onSetContent(setContent), [])

  useEffect(() => {
    void window.aether.settings.get().then((s) => {
      // Pas de store partagé avec la fenêtre principale (contexte JS séparé),
      // même raison que PopoverRoot.tsx.
      document.documentElement.dataset.theme = s.theme
      document.documentElement.style.setProperty('zoom', String(s.uiScale))
    })
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const report = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        window.aether.permissionPrompt.reportSize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) })
      }
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [content])

  if (!content) return null
  const t = (key: string, vars?: Record<string, string | number>): string => translate(locale, key, vars)
  const Icon = ICONS[content.kind] ?? ShieldAlert
  const messageKey = MESSAGE_KEYS[content.kind] ?? 'focusCanvas.permissionPrompt.wantsMedia'

  return (
    <div ref={rootRef} className="inline-block">
      <div className="popover-surface w-80 overflow-hidden rounded-xl p-3.5">
        <div className="flex items-start gap-2.5">
          <Icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-glacier" />
          <p className="min-w-0 text-[12.5px] leading-snug text-ink-dim">
            <span className="break-all font-medium text-ink">{content.origin}</span>{' '}
            {t(messageKey)}
          </p>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.aether.permissionPrompt.respond(content.requestId, false)}
            className="rounded-lg px-3 py-1.5 text-[12px] text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink-dim"
          >
            {t('focusCanvas.permissionPrompt.block')}
          </button>
          <button
            type="button"
            onClick={() => window.aether.permissionPrompt.respond(content.requestId, true)}
            className="rounded-lg bg-glacier px-3 py-1.5 text-[12px] font-medium text-ink-onaccent transition-opacity hover:opacity-90"
          >
            {t('focusCanvas.permissionPrompt.allow')}
          </button>
        </div>
      </div>
    </div>
  )
}
