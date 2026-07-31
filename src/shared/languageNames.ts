/** Noms français des langues les plus courantes — partagé entre le renderer
 * (TranslatePopoverCard.tsx, liste complète de choix) et le main (viewManager.ts,
 * libellé du raccourci « Traduire en… » du menu contextuel d'une page web) :
 * les deux ont besoin du MÊME nom pour le MÊME code, sans dupliquer la liste
 * de part et d'autre de la frontière process. Pas une liste exhaustive. */
export const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'français',
  en: 'anglais',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  pt: 'portugais',
  nl: 'néerlandais',
  ru: 'russe',
  ja: 'japonais',
  zh: 'chinois',
  ko: 'coréen',
  ar: 'arabe',
  pl: 'polonais',
  tr: 'turc',
  sv: 'suédois',
  uk: 'ukrainien'
}
