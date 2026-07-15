/**
 * Widgets de la page de nouvel onglet — météo et actualités.
 * Récupération côté MAIN (pas renderer) : évite tout souci de CORS et garde
 * ces requêtes tierces hors du contexte des pages web affichées. Aucune clé
 * API requise (ip-api.com/open-meteo pour la météo, flux RSS Le Monde pour
 * les actualités) — résultats mis en cache en mémoire pour ne pas marteler
 * ces services à chaque ouverture d'un nouvel onglet.
 */
import type { NewTabCitySuggestion, NewTabNewsItem, NewTabWeather } from '@shared/types'
import { getSettings } from './settings'

const WEATHER_TTL_MS = 15 * 60 * 1000
const NEWS_TTL_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

let weatherCache: { key: string; value: NewTabWeather | null; at: number } | null = null
let newsCache: { value: NewTabNewsItem[]; at: number } | null = null

/** "2026-07-14T21:03" (open-meteo, `&timezone=auto`) → "21:03". */
function extractTime(iso: string | undefined): string | null {
  return iso?.split('T')[1]?.slice(0, 5) ?? null
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface Located {
  lat: number
  lon: number
  city: string
  region: string
  country: string
}

export async function searchNewTabCities(query: string): Promise<NewTabCitySuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const res = await fetchWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=fr&format=json`
    )
    const data = (await res.json()) as {
      results?: { name?: string; country?: string; admin1?: string; latitude?: number; longitude?: number }[]
    }
    return (data.results ?? [])
      .filter(
        (r): r is { name: string; country?: string; admin1?: string; latitude: number; longitude: number } =>
          Boolean(r.name) && typeof r.latitude === 'number' && typeof r.longitude === 'number'
      )
      .map((r) => ({
        name: r.name,
        admin1: r.admin1 ?? '',
        country: r.country ?? '',
        lat: r.latitude,
        lon: r.longitude,
        label: [r.name, r.admin1, r.country].filter(Boolean).join(', ')
      }))
  } catch {
    return []
  }
}

async function locateByIp(): Promise<Located | null> {
  // ipapi.co rate-limite très agressivement les requêtes anonymes (testé :
  // « RateLimited » dès la 1ère requête) — ip-api.com (HTTP, sans clé,
  // 45 req/min) s'est montré fiable en pratique.
  const res = await fetchWithTimeout('http://ip-api.com/json/?fields=status,city,regionName,country,lat,lon')
  const geo = (await res.json()) as {
    status?: string
    city?: string
    regionName?: string
    country?: string
    lat?: number
    lon?: number
  }
  if (geo.status !== 'success' || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') return null
  return { lat: geo.lat, lon: geo.lon, city: geo.city || '', region: geo.regionName || '', country: geo.country || '' }
}

export async function getNewTabWeather(): Promise<NewTabWeather | null> {
  const location = getSettings().newTabWeatherLocation
  const cacheKey = location ? `${location.lat},${location.lon}` : '__auto__'
  if (weatherCache && weatherCache.key === cacheKey && Date.now() - weatherCache.at < WEATHER_TTL_MS) {
    return weatherCache.value
  }

  try {
    const located: Located | null = location
      ? { lat: location.lat, lon: location.lon, city: location.name, region: location.admin1, country: location.country }
      : await locateByIp()
    if (!located) {
      weatherCache = { key: cacheKey, value: null, at: Date.now() }
      return null
    }
    const forecastRes = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${located.lat}&longitude=${located.lon}` +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index' +
        '&daily=sunrise,sunset&timezone=auto'
    )
    const forecast = (await forecastRes.json()) as {
      current?: {
        temperature_2m?: number
        apparent_temperature?: number
        relative_humidity_2m?: number
        wind_speed_10m?: number
        weather_code?: number
        uv_index?: number
      }
      daily?: { sunrise?: string[]; sunset?: string[] }
    }
    if (typeof forecast.current?.temperature_2m !== 'number') {
      weatherCache = { key: cacheKey, value: null, at: Date.now() }
      return null
    }
    const value: NewTabWeather = {
      city: located.city,
      region: located.region,
      country: located.country,
      tempC: Math.round(forecast.current.temperature_2m),
      code: forecast.current.weather_code ?? 0,
      feelsLikeC:
        typeof forecast.current.apparent_temperature === 'number'
          ? Math.round(forecast.current.apparent_temperature)
          : null,
      humidity:
        typeof forecast.current.relative_humidity_2m === 'number' ? forecast.current.relative_humidity_2m : null,
      windKph: typeof forecast.current.wind_speed_10m === 'number' ? Math.round(forecast.current.wind_speed_10m) : null,
      uvIndex: typeof forecast.current.uv_index === 'number' ? Math.round(forecast.current.uv_index * 10) / 10 : null,
      sunrise: extractTime(forecast.daily?.sunrise?.[0]),
      sunset: extractTime(forecast.daily?.sunset?.[0])
    }
    weatherCache = { key: cacheKey, value, at: Date.now() }
    return value
  } catch {
    weatherCache = { key: cacheKey, value: null, at: Date.now() }
    return null
  }
}

/** Extraction minimaliste `<title>`/`<link>`/`<media:content url>` d'un flux RSS — pas de dépendance XML. */
function parseRssItems(xml: string, limit: number): NewTabNewsItem[] {
  const items: NewTabNewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while (items.length < limit && (match = itemRe.exec(xml))) {
    const block = match[1]
    const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(block)
    const linkMatch = /<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/.exec(block)
    if (!titleMatch || !linkMatch) continue
    const imageMatch =
      /<media:content[^>]*\burl="([^"]+)"/.exec(block) ?? /<enclosure[^>]*\burl="([^"]+)"/.exec(block)
    items.push({
      title: decodeXmlEntities(titleMatch[1].trim()),
      url: linkMatch[1].trim(),
      imageUrl: imageMatch ? imageMatch[1].trim() : null
    })
  }
  return items
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Suggestions de recherche (façon barre d'adresse Chrome) — API publique de
 * complétion de Google, aucune clé requise. `client=firefox` renvoie un JSON
 * propre `[query, [suggestions...]]` (pas de wrapper JSONP à parser).
 * **Piège vérifié en direct (curl)** : ce service répond en
 * `Content-Type: text/javascript; charset=ISO-8859-1` — un vrai Latin-1, PAS
 * de l'UTF-8 malgré ce que suppose `Response.json()` (qui décode TOUJOURS en
 * UTF-8, quel que soit le charset déclaré). Décoder les octets bruts sans
 * repasser par cette hypothèse UTF-8 erronée est indispensable : sinon,
 * chaque caractère accentué (é, è, û…) devient une séquence UTF-8 invalide,
 * affichée comme un losange point d'interrogation (U+FFFD). */
export async function getSearchSuggestions(query: string): Promise<string[]> {
  const q = query.trim()
  if (q.length < 1) return []
  try {
    const res = await fetchWithTimeout(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`
    )
    const bytes = await res.arrayBuffer()
    const text = new TextDecoder('iso-8859-1').decode(bytes)
    const data = JSON.parse(text) as [string, string[]] | unknown
    return Array.isArray(data) && Array.isArray(data[1]) ? (data[1] as string[]).slice(0, 8) : []
  } catch {
    return []
  }
}

export async function getNewTabNews(force = false): Promise<NewTabNewsItem[]> {
  if (!force && newsCache && Date.now() - newsCache.at < NEWS_TTL_MS) return newsCache.value

  try {
    // Le Monde (« Une ») plutôt que Google Actualités : liens directs (pas de
    // redirection news.google.com) ET images `<media:content>` présentes sur
    // la quasi-totalité des articles, nécessaires au mode « photos ».
    const res = await fetchWithTimeout('https://www.lemonde.fr/rss/une.xml')
    const xml = await res.text()
    // Un lot plus large que ce qui est affiché : le bouton « actualiser » peut
    // ainsi piocher un sous-ensemble différent sans dépendre du rythme de
    // publication réel du flux (qui ne change pas forcément entre deux clics).
    const items = parseRssItems(xml, 20)
    newsCache = { value: items, at: Date.now() }
    return items
  } catch {
    newsCache = { value: [], at: Date.now() }
    return []
  }
}
