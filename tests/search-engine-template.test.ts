/**
 * Conversion d'une URL de recherche RÉELLE en gabarit (`%s`) — ce qui permet
 * d'ajouter un moteur en collant simplement l'adresse d'une recherche, au lieu
 * d'exiger de l'utilisateur qu'il compose le gabarit à la main.
 */
import { describe, expect, it } from 'vitest'
import { normalizeEngineUrl, templateFromPastedUrl } from '../src/renderer/src/lib/searchEngineTemplate'

describe('templateFromPastedUrl', () => {
  it('repère le paramètre de requête et le remplace par %s', () => {
    expect(templateFromPastedUrl('https://exemple.com/search?q=chat')).toBe('https://exemple.com/search?q=%s')
    expect(templateFromPastedUrl('https://exemple.com/s?query=chat%20noir')).toBe('https://exemple.com/s?query=%s')
  })

  it('conserve les AUTRES paramètres intacts', () => {
    const out = templateFromPastedUrl('https://exemple.com/search?hl=fr&q=chat&safe=on')
    expect(out).toContain('hl=fr')
    expect(out).toContain('safe=on')
    expect(out).toContain('q=%s')
  })

  it('n’encode pas le marqueur %s', () => {
    // `URLSearchParams` ré-encode naturellement `%` en `%25` : le gabarit
    // deviendrait `%25s` et ne serait plus jamais reconnu.
    const out = templateFromPastedUrl('https://exemple.com/search?q=chat')
    expect(out).not.toContain('%25')
  })

  it('renvoie null quand aucun paramètre de requête n’est reconnaissable', () => {
    expect(templateFromPastedUrl('https://exemple.com/page')).toBeNull()
    expect(templateFromPastedUrl('pas une url')).toBeNull()
    // Paramètre présent mais vide : rien à remplacer.
    expect(templateFromPastedUrl('https://exemple.com/search?q=')).toBeNull()
  })

  it('accepte les trois formes de saisie, via normalizeEngineUrl', () => {
    // Gabarit déjà écrit à la main : laissé tel quel.
    expect(normalizeEngineUrl('https://exemple.com/s?q=%s')).toBe('https://exemple.com/s?q=%s')
    // Syntaxe OpenSearch (Chrome/Firefox) : traduite.
    expect(normalizeEngineUrl('https://exemple.com/s?q={searchTerms}')).toBe('https://exemple.com/s?q=%s')
    // Adresse d'une recherche réelle : convertie.
    expect(normalizeEngineUrl('https://exemple.com/s?q=chat')).toBe('https://exemple.com/s?q=%s')
    // Rien d'exploitable : refus explicite, pour afficher une aide.
    expect(normalizeEngineUrl('bonjour')).toBeNull()
  })

  it('gère les vrais moteurs de recherche', () => {
    expect(templateFromPastedUrl('https://duckduckgo.com/?q=test')).toBe('https://duckduckgo.com/?q=%s')
    expect(templateFromPastedUrl('https://www.qwant.com/?q=test&t=web')).toContain('q=%s')
    expect(templateFromPastedUrl('https://www.youtube.com/results?search_query=test')).toBe(
      'https://www.youtube.com/results?search_query=%s'
    )
  })
})
