/**
 * Moteur de traduction de l'interface ÆTHER — volontairement minimal (pas de
 * dépendance externe) : un dictionnaire plat `clé.pointée -> texte`, assemblé
 * à partir de fichiers par section (`locales/fr/<section>.ts`).
 * `{{var}}` dans un texte est remplacé par `vars.var` si fourni.
 * Français uniquement — ÆTHER a abandonné les autres langues d'interface
 * (trop de travail à maintenir pour une interface d'appli, pas les pages web).
 */
import { fr } from './locales/fr'

export type Locale = 'fr'

/** Traduit une clé — repli sur la clé brute si absente du dictionnaire. */
export function translate(_locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let str = fr[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{{${k}}}`).join(String(v))
    }
  }
  return str
}
