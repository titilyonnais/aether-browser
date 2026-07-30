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

/**
 * Couleurs de texte utilisées PAR-DESSUS un thème (dégradé ou photo).
 *
 * Le voile de lisibilité (`computeReadableScrim`) garantit un contraste ≥ 4.5:1
 * pour la PLUS SOMBRE de ces trois valeurs — c'est-à-dire pour tout texte de la
 * page. Les tons secondaires par défaut (`--color-ink-dim` #9a9ab0,
 * `--color-ink-faint` #7c7c98) sont bien trop sombres pour cela : les garantir
 * exigerait un voile quasi opaque, qui effacerait l'image. On les REMONTE donc
 * ici plutôt que de poser des cartes opaques derrière les textes — c'est le
 * texte qui s'adapte au fond, pas l'inverse.
 *
 * ATTENTION — ces valeurs ne suffisent QUE si le texte est rendu à pleine
 * opacité. Un texte semi-transparent (`text-ink-faint/50` et consorts) se
 * mélange à son propre fond : plus le voile assombrit, plus le texte
 * s'assombrit avec lui, et le contraste PLAFONNE. À 50 % d'opacité, le maximum
 * atteignable est 3.74:1 même sur du noir pur — sous le seuil, quoi qu'on
 * fasse. C'était la cause réelle des textes illisibles sur une photo, et
 * aucune force de voile n'aurait pu la corriger. Les modificateurs d'opacité
 * sont donc neutralisés sur un thème actif (règle `[data-on-theme]`,
 * global.css), ce qui préserve la teinte voulue par le design tout en rendant
 * le calcul de contraste ci-dessus réellement valable.
 */
export const ON_BACKGROUND_TEXT = {
  ink: '#f4f4fa',
  dim: '#e2e2ec',
  /** Le plus sombre des trois — c'est LUI que le voile doit garantir. */
  faint: '#cfcfdd'
} as const

/** Variables CSS à poser sur le conteneur d'une zone posée sur un thème, pour
 * que tout le texte qu'elle contient reste au-dessus du seuil de lisibilité.
 * À combiner avec l'attribut `data-on-theme` (voir `ON_THEME_ATTR`), qui
 * neutralise les opacités partielles — sans lui, ces couleurs ne garantissent
 * rien pour les textes semi-transparents. Objet vide (aucune surcharge) sans
 * thème actif : les tons par défaut de `global.css` conviennent parfaitement
 * sur une surface unie. */
export function onBackgroundTextVars(hasBackground: boolean): Record<string, string> {
  if (!hasBackground) return {}
  return {
    '--color-ink': ON_BACKGROUND_TEXT.ink,
    '--color-ink-dim': ON_BACKGROUND_TEXT.dim,
    '--color-ink-faint': ON_BACKGROUND_TEXT.faint
  }
}

/** Attribut marquant une zone posée sur un thème — voir la règle
 * `[data-on-theme]` de global.css. */
export const ON_THEME_ATTR = 'data-on-theme'

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

/**
 * Version de l'algorithme de calcul du voile (`computeReadableScrim`). À
 * INCRÉMENTER dès que ce calcul change : les images déjà importées portent la
 * valeur obtenue avec l'ancienne méthode, et sans ce marqueur il faudrait
 * réimporter manuellement son image pour bénéficier d'une correction — ce qui
 * n'est évidemment pas acceptable pour un correctif de lisibilité.
 *
 * 2 — échantillonnage 64×64 et centile 97 % (au lieu de 32×32 / 90 %), après
 * constat que le texte restait illisible sur une photo aux zones claires
 * localisées.
 */
export const SCRIM_ALGO_VERSION = 2

/** Ce thème a-t-il besoin d'un recalcul de son voile ? Vrai uniquement pour une
 * image personnelle dont le voile vient d'une version antérieure du calcul. */
export function needsScrimRecompute(theme: NewTabBackground | null): boolean {
  return theme?.kind === 'custom' && theme.scrimAlgo !== SCRIM_ALGO_VERSION
}

/** Couches animées d'un thème vivant, ou tableau vide (thème statique/image). */
export function themeAnimatedLayers(theme: NewTabBackground | null): { css: string; className: string }[] {
  if (theme?.kind !== 'preset') return []
  return backgroundPreset(theme.value)?.animated ?? []
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
