/**
 * Icône + clé i18n pour chaque catégorie de permission de site — partagé
 * entre SiteInfoCard.tsx (bulle « informations du site ») et
 * SettingsOverlay.tsx (vue d'ensemble des autorisations), pour éviter deux
 * mappings dupliqués et divergents.
 */
import {
  AppWindow,
  BellRing,
  Camera,
  Clipboard,
  Cookie,
  Download,
  FileCode,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  Mic,
  Music2,
  ShieldAlert,
  Volume2
} from 'lucide-react'
import type { SitePermissionKind } from '@shared/types'

export const PERMISSION_LABELS: Record<SitePermissionKind, { key: string; icon: typeof Camera }> = {
  media: { key: 'focusCanvas.siteInfo.permissionMedia', icon: Camera },
  camera: { key: 'focusCanvas.siteInfo.permissionCamera', icon: Camera },
  microphone: { key: 'focusCanvas.siteInfo.permissionMicrophone', icon: Mic },
  geolocation: { key: 'focusCanvas.siteInfo.permissionGeolocation', icon: MapPin },
  notifications: { key: 'focusCanvas.siteInfo.permissionNotifications', icon: BellRing },
  midi: { key: 'focusCanvas.siteInfo.permissionMidi', icon: Music2 },
  clipboard: { key: 'focusCanvas.siteInfo.permissionClipboard', icon: Clipboard },
  fileSystem: { key: 'focusCanvas.siteInfo.permissionFileSystem', icon: FolderOpen },
  sound: { key: 'focusCanvas.siteInfo.permissionSound', icon: Volume2 },
  cookies: { key: 'focusCanvas.siteInfo.permissionCookies', icon: Cookie },
  images: { key: 'focusCanvas.siteInfo.permissionImages', icon: ImageIcon },
  javascript: { key: 'focusCanvas.siteInfo.permissionJavascript', icon: FileCode },
  popups: { key: 'focusCanvas.siteInfo.permissionPopups', icon: AppWindow },
  autoDownloads: { key: 'focusCanvas.siteInfo.permissionAutoDownloads', icon: Download },
  insecureContent: { key: 'focusCanvas.siteInfo.permissionInsecureContent', icon: ShieldAlert }
}
