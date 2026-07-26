/**
 * Application d'un thème ÆTHER aux variables CSS de la racine.
 *
 * Partagé par les TROIS contextes JS de l'interface — fenêtre principale
 * (App.tsx), popups flottants (PopoverRoot.tsx) et invite de permission
 * (PermissionPromptRoot.tsx) : chacun a son propre `document`, donc son
 * propre `:root` à repeindre. Sans ce partage, changer de thème laissait les
 * menus contextuels et les invites sur la teinte par défaut.
 */
import { backgroundPreset, type ThemeSurfaces } from './backgroundPresets'
import type { NewTabBackground } from '@shared/types'

/** Surfaces par défaut — identiques aux valeurs de `global.css`, reprises ici
 * pour pouvoir REVENIR au thème de base (aucun thème choisi) sans dépendre
 * d'un rechargement de la feuille de style. */
const DEFAULT_SURFACES: ThemeSurfaces = {
  void: '#060608',
  abyss: '#0a0a10',
  mist: '#101018',
  veil: '#16161f'
}

export const ACCENT_HEX: Record<string, string> = {
  glacier: '#a9c9ec',
  lavande: '#b3a4e6',
  emeraude: '#8fe0c2',
  ambre: '#e6c78f',
  rose: '#e6a4c4'
}

/** Couleur d'accent effective d'après les réglages (`custom` → `accentCustom`). */
export function resolveAccent(accent: string, accentCustom: string): string {
  if (accent === 'custom' && accentCustom) return accentCustom
  return ACCENT_HEX[accent] ?? ACCENT_HEX.glacier
}

/**
 * Repeint les variables de surface et d'accent sur `root`. Une image
 * personnalisée n'apporte pas de palette : on garde les surfaces par défaut
 * (neutres) plutôt que d'échantillonner la photo, dont la couleur dominante
 * conviendrait rarement à des panneaux d'interface — la couleur d'accent,
 * elle, reste extractible à la demande (bouton dédié dans les réglages).
 */
export function applyTheme(
  root: HTMLElement,
  theme: NewTabBackground | null,
  accent: string,
  accentCustom: string
): void {
  const surfaces = (theme?.kind === 'preset' ? backgroundPreset(theme.value)?.surfaces : null) ?? DEFAULT_SURFACES
  root.style.setProperty('--color-void', surfaces.void)
  root.style.setProperty('--color-abyss', surfaces.abyss)
  root.style.setProperty('--color-mist', surfaces.mist)
  root.style.setProperty('--color-veil', surfaces.veil)
  root.style.setProperty('--color-glacier', resolveAccent(accent, accentCustom))
}

/** Fond CSS d'un thème, à poser sur la page de nouvel onglet et sur `<body>`
 * (chrome). Retourne `null` si aucun thème n'est actif. */
export function themeBackgroundCss(theme: NewTabBackground | null): string | null {
  if (!theme) return null
  if (theme.kind === 'preset') return backgroundPreset(theme.value)?.css ?? null
  return `url("aether://avatars/${theme.value}")`
}

/** Opacité EFFECTIVE du voile de lisibilité. Pour un thème intégré, la valeur
 * à jour du catalogue prime toujours sur celle éventuellement persistée par
 * une version antérieure ; pour une image, c'est la valeur calculée à
 * l'import (voir `computeReadableScrim`) qui fait foi. */
export function effectiveScrim(theme: NewTabBackground | null): number {
  if (!theme) return 0
  if (theme.kind === 'preset') return backgroundPreset(theme.value)?.scrim ?? theme.scrim ?? 0.32
  return theme.scrim ?? 0.55
}
