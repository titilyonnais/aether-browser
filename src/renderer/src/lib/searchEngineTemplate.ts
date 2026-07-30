/**
 * Conversion d'une URL de recherche réelle en gabarit de moteur.
 *
 * Ajouter un moteur imposait jusqu'ici de composer soi-même un gabarit avec
 * `%s` au bon endroit — une contrainte technique inutile. Il suffit désormais
 * de lancer une recherche sur le moteur voulu et d'en coller l'adresse : la
 * requête y est repérée toute seule.
 */

/** Paramètres de requête les plus courants, du plus au moins spécifique.
 * `q` couvre l'écrasante majorité (Google, DuckDuckGo, Brave, Bing, Ecosia,
 * Qwant…) ; les suivants couvrent YouTube, Baidu, Yandex et quelques autres. */
const QUERY_PARAM_NAMES = ['q', 'query', 'search_query', 'search', 'text', 'wd', 'kw', 'p', 'k', 's']

/**
 * Remplace la valeur du paramètre de requête par `%s`. Retourne `null` si
 * l'adresse n'est pas exploitable (pas une URL, ou aucun paramètre plausible) —
 * la saisie manuelle d'un gabarit reste alors possible.
 */
export function templateFromPastedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  for (const name of QUERY_PARAM_NAMES) {
    const value = url.searchParams.get(name)
    if (value && value.trim() !== '') {
      url.searchParams.set(name, '%s')
      // `searchParams` ré-encode le `%` en `%25` : le gabarit contiendrait
      // `%25s`, que `buildSearchUrl` ne reconnaîtrait jamais. On le rétablit.
      return url.toString().replace(/%25s/g, '%s')
    }
  }
  return null
}

/**
 * Normalise ce que l'utilisateur a saisi en gabarit exploitable. Trois formes
 * acceptées, de la plus explicite à la plus naturelle : un gabarit `%s`, la
 * syntaxe OpenSearch `{searchTerms}` (celle de Chrome et Firefox, que certains
 * connaissent déjà), ou l'adresse d'une recherche réelle. `null` si rien n'est
 * exploitable.
 */
export function normalizeEngineUrl(input: string): string | null {
  if (input.includes('%s')) return input
  if (input.includes('{searchTerms}')) return input.replace(/\{searchTerms\}/g, '%s')
  return templateFromPastedUrl(input)
}

/** Favicon d'un moteur, servi par son PROPRE domaine. Pas de service tiers :
 * le classique `google.com/s2/favicons` ferait transiter par Google jusqu'à la
 * vignette de DuckDuckGo, ce qui serait malvenu ici. */
export function engineIconUrl(searchUrl: string): string | null {
  try {
    return new URL(searchUrl).origin + '/favicon.ico'
  } catch {
    return null
  }
}
