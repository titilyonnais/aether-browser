/**
 * Classification heuristique d'une entrée de la Barre d'Intention.
 * Pure et sans dépendance : utilisée côté renderer (retour instantané)
 * et côté main (base avant raffinement IA).
 */
import type { IntentResult, SearchEngineId } from './types'

// ─── Routes internes (façade « chrome:// ») ──────────────────────────────────

export type InternalRouteKind = 'settings' | 'guide' | 'downloads'

export interface InternalRoute {
  kind: InternalRouteKind
  /** Section de réglages ciblée (pour chrome://settings/<sous-page>). */
  section?: string
}

/** Sous-chemins de chrome://settings → section des réglages ÆTHER. */
const SETTINGS_SUBPAGE_TO_SECTION: Record<string, string> = {
  privacy: 'confidentialite',
  security: 'confidentialite',
  clearbrowserdata: 'donnees',
  content: 'confidentialite',
  cookies: 'confidentialite',
  sitesettings: 'confidentialite',
  search: 'recherche',
  searchengines: 'recherche',
  defaultsearch: 'recherche',
  downloads: 'navigation',
  appearance: 'apparence',
  fonts: 'apparence',
  onstartup: 'navigation',
  languages: 'langues',
  spellcheck: 'langues',
  performance: 'performance',
  accessibility: 'apparence',
  system: 'systeme',
  proxy: 'systeme',
  reset: 'reinitialiser',
  people: 'profils',
  syncsetup: 'profils',
  manageprofile: 'profils',
  extensions: 'extensions',
  help: 'apropos',
  about: 'apropos'
}

/**
 * Fait correspondre les URLs internes façon Chrome à une action ÆTHER.
 * Ne concerne QUE les pages « produit » (settings, flags, help…) que Chrome
 * possède mais qui n'existent pas dans le moteur ; les diagnostics réels du
 * moteur (chrome://gpu, media-internals…) renvoient null et se chargent en page.
 */
export function resolveInternalRoute(input: string): InternalRoute | null {
  const m = /^(?:chrome|aether|about):\/*([\w-]+)(?:\/+([\w-]+))?/i.exec(input.trim())
  if (!m) return null
  const host = m[1].toLowerCase()
  const sub = (m[2] ?? '').toLowerCase()
  switch (host) {
    case 'settings':
    case 'preferences':
    case 'prefs':
      return { kind: 'settings', section: SETTINGS_SUBPAGE_TO_SECTION[sub] }
    case 'flags':
    case 'labo':
      // Les drapeaux moteur sont désormais répartis (Performance, Apparence, Système) ;
      // Performance regroupe l'essentiel (accélération matérielle, expérimental).
      return { kind: 'settings', section: 'performance' }
    case 'help':
    case 'guide':
      return { kind: 'guide' }
    case 'version':
    case 'about':
    case 'chrome-urls':
    case 'internals':
    case 'credits':
    case 'terms':
      return { kind: 'settings', section: 'apropos' }
    case 'downloads':
      return { kind: 'downloads' }
    case 'extensions':
    case 'extensions-frame':
      return { kind: 'settings', section: 'extensions' }
    case 'history':
      return { kind: 'settings', section: 'donnees' }
    case 'password-manager':
    case 'passwords':
    case 'autofill':
    case 'payments':
      return { kind: 'settings', section: 'confidentialite' }
    case 'accessibility-settings':
      return { kind: 'settings', section: 'apparence' }
    default:
      return null
  }
}

const PROTOCOL_RE = /^(https?|about|chrome|view-source|file):/i
const DOMAIN_RE = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d{2,5})?([/?#].*)?$/i
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d{2,5})?([/?#].*)?$/

const COMPARE_RE =
  /^\s*compar(?:e[rz]?|aison(?:\s+entre)?)\s+(.+?)\s+(?:et|vs\.?|versus|avec)\s+(.+?)\s*$/i

/** Verbes qui visent la page active (résumé, analyse…). */
const ASK_PAGE_RE =
  /^\s*(résume|resume|synthétise|synthetise|explique|analyse|traduis|critique|simplifie)\b/i

/** Verbes génératifs → dialogue avec Muse. */
const ASK_GENERAL_RE =
  /^\s*(aide[- ]moi|prépare|prepare|rédige|redige|écris|ecris|planifie|organise|génère|genere|propose|imagine|brainstorm)\b/i

const INTERROGATIVE_RE =
  /^\s*(comment|pourquoi|quel(le)?s?|que\b|qui\b|où\b|ou\b|quand|combien|est[- ]ce)/i

const wordCount = (s: string): number => s.trim().split(/\s+/).length

/** Normalise une entrée qui ressemble à une URL en URL complète. */
export function normalizeToUrl(input: string): string {
  const trimmed = input.trim()
  if (PROTOCOL_RE.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function heuristicClassify(rawInput: string): IntentResult {
  const input = rawInput.trim()
  const base = { input, source: 'heuristic' as const }

  // 1. URL explicite ou implicite
  if (PROTOCOL_RE.test(input)) {
    return { ...base, type: 'url', url: input }
  }
  if (!/\s/.test(input) && (DOMAIN_RE.test(input) || IP_RE.test(input))) {
    return { ...base, type: 'url', url: normalizeToUrl(input) }
  }

  // 2. Intention de comparaison → vue scindée
  const compare = COMPARE_RE.exec(input)
  if (compare) {
    return {
      ...base,
      type: 'intent',
      query: input,
      plan: { kind: 'compare', left: compare[1].trim(), right: compare[2].trim() }
    }
  }

  // 3. Intention adressée à Muse (page active ou génération)
  if (ASK_PAGE_RE.test(input) || ASK_GENERAL_RE.test(input)) {
    return { ...base, type: 'intent', query: input, plan: { kind: 'ask' } }
  }

  // 4. Question développée → recherche accompagnée par Muse
  if (INTERROGATIVE_RE.test(input) && (wordCount(input) >= 6 || input.endsWith('?'))) {
    return { ...base, type: 'intent', query: input, plan: { kind: 'search-and-ask' } }
  }

  // 5. Par défaut : recherche
  return { ...base, type: 'search', query: input }
}

// ─── Moteurs de recherche ────────────────────────────────────────────────────

export const SEARCH_ENGINES: Record<SearchEngineId, { label: string; url: string }> = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  ecosia: { label: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' }
}

/**
 * Construit l'URL de recherche pour un identifiant de moteur, intégré ou
 * personnalisé (`custom` fournit les moteurs ajoutés par l'utilisateur).
 */
export function buildSearchUrl(
  engine: string,
  query: string,
  custom: { id: string; url: string }[] = []
): string {
  const builtin = (SEARCH_ENGINES as Record<string, { label: string; url: string }>)[engine]
  const template = builtin?.url ?? custom.find((c) => c.id === engine)?.url ?? SEARCH_ENGINES.duckduckgo.url
  return template.replace('%s', encodeURIComponent(query))
}
