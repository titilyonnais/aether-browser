/**
 * Libellés d'affichage d'une page — centralise le cas spécial du nouvel
 * onglet vierge (page d'accueil ÆTHER), affiché « Nouvel onglet » (titre) et
 * « Page d'accueil » (sous-titre/domaine) partout : bande d'onglets, cartes
 * de la Toile, liste des pages, aperçus, constellation. Français uniquement
 * (voir i18n/index.ts) : `translate` non réactif est sans conséquence ici.
 */
import { translate } from '@/i18n'
import { domainOf } from './utils'

/** Vrai pour la page de nouvel onglet vierge (page d'accueil ÆTHER). */
export function isNewTabUrl(url: string): boolean {
  return url.startsWith('aether://newtab')
}

/** Titre affiché d'une page (onglet, carte, liste). */
export function pageLabel(page: { url: string; title: string }): string {
  if (isNewTabUrl(page.url)) return translate('fr', 'focusCanvas.newTab.label')
  return page.title || domainOf(page.url)
}

/** Sous-titre / domaine affiché d'une page. */
export function pageSubtitle(page: { url: string }): string {
  if (isNewTabUrl(page.url)) return translate('fr', 'focusCanvas.newTab.home')
  return domainOf(page.url)
}
