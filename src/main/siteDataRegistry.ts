/**
 * Registre des données par site (« Tous les sites », photo 6/7) — la liste
 * des origines vient de `session.cookies.get({})` (natif, énumère TOUTE la
 * partition y compris les origines intégrées/tierces), enrichie des tailles
 * réelles via CDP `Storage.getUsageAndQuota`, mises en cache (TTL 60s,
 * invalidées explicitement après une suppression).
 *
 * Electron n'expose aucune API « liste toutes les origines » directe — les
 * cookies sont le seul signal natif disponible ; une origine sans aucun
 * cookie mais avec du stockage local (IndexedDB…) n'apparaîtra pas ici,
 * limite assumée et documentée (comme le plan l'anticipait).
 */
import { BrowserWindow, session } from 'electron'
import type { SiteDataGroup, SiteDataOrigin } from '@shared/types'

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  origins: SiteDataOrigin[]
  fetchedAt: number
}

const cacheByPartition = new Map<string, CacheEntry>()
/** Une fenêtre cachée par partition, hôte du `debugger` CDP — pas besoin
 * qu'une vraie page de cette origine soit ouverte : `Storage.getUsageAndQuota`
 * prend l'origine en PARAMÈTRE, portée à tout le contexte de stockage
 * (voir le commentaire d'implémentation dans le plan). */
const hiddenHosts = new Map<string, BrowserWindow>()

/** Petite liste de suffixes composés connus — pas de dépendance à une vraie
 * liste de suffixes publics (PSL) pour ce simple regroupement d'affichage. */
const COMPOUND_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.br',
  'com.au',
  'co.jp',
  'co.kr',
  'com.cn',
  'co.in',
  'com.mx'
])

/** Domaine « registrable » façon photo 6 (la ligne groupée avant dépliage) —
 * heuristique deux-labels, avec repli trois-labels pour les suffixes composés
 * connus (COMPOUND_SUFFIXES) ; pas une vraie résolution PSL. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.split('.')
  if (labels.length <= 2) return hostname
  const lastTwo = labels.slice(-2).join('.')
  if (labels.length >= 3 && COMPOUND_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.')
  return lastTwo
}

function hiddenHostFor(partition: string): BrowserWindow {
  const existing = hiddenHosts.get(partition)
  if (existing && !existing.isDestroyed()) return existing
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition, sandbox: true }
  })
  hiddenHosts.set(partition, win)
  win.on('closed', () => hiddenHosts.delete(partition))
  return win
}

async function usageForOrigin(partition: string, origin: string): Promise<number> {
  const wc = hiddenHostFor(partition).webContents
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    const result = (await wc.debugger.sendCommand('Storage.getUsageAndQuota', { origin })) as
      | { usage?: number }
      | undefined
    return result?.usage ?? 0
  } catch {
    // CDP indisponible pour cette origine (jamais visitée dans ce contexte,
    // erreur de protocole…) — 0 plutôt qu'une valeur inventée.
    return 0
  }
}

/** Origines exactes connues (via leurs cookies) pour une partition, avec
 * taille CDP — PAS de cache ici, voir `listSiteDataGroups` pour la version
 * mise en cache utilisée par l'UI. */
async function computeOrigins(partition: string): Promise<SiteDataOrigin[]> {
  const cookies = await session.fromPartition(partition).cookies.get({})
  const cookieCounts = new Map<string, number>()
  for (const c of cookies) {
    const host = c.domain?.replace(/^\./, '')
    if (!host) continue
    // Le cookie ne porte pas le schéma — on suppose https, hypothèse
    // raisonnable en 2026 et sans conséquence réelle (juste l'affichage).
    const origin = `https://${host}`
    cookieCounts.set(origin, (cookieCounts.get(origin) ?? 0) + 1)
  }
  const origins: SiteDataOrigin[] = []
  for (const [origin, cookieCount] of cookieCounts) {
    origins.push({ origin, cookieCount, usageBytes: await usageForOrigin(partition, origin) })
  }
  return origins
}

async function originsForPartition(partition: string): Promise<SiteDataOrigin[]> {
  const cached = cacheByPartition.get(partition)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.origins
  const origins = await computeOrigins(partition)
  cacheByPartition.set(partition, { origins, fetchedAt: Date.now() })
  return origins
}

/** Liste groupée par domaine registrable (« Tous les sites », photo 6). */
export async function listSiteDataGroups(partition: string): Promise<SiteDataGroup[]> {
  const origins = await originsForPartition(partition)
  const groups = new Map<string, SiteDataOrigin[]>()
  for (const o of origins) {
    let hostname: string
    try {
      hostname = new URL(o.origin).hostname
    } catch {
      continue
    }
    const domain = registrableDomain(hostname)
    const arr = groups.get(domain)
    if (arr) arr.push(o)
    else groups.set(domain, [o])
  }
  return Array.from(groups.entries())
    .map(([registrableDomain, groupOrigins]) => ({
      registrableDomain,
      totalBytes: groupOrigins.reduce((sum, o) => sum + o.usageBytes, 0),
      totalCookies: groupOrigins.reduce((sum, o) => sum + o.cookieCount, 0),
      origins: groupOrigins.sort((a, b) => b.usageBytes - a.usageBytes)
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
}

/** Détail d'UN domaine registrable précis (page de réglages par site — même
 * regroupement que `listSiteDataGroups`, filtré à un seul domaine). */
export async function siteDataGroupFor(partition: string, domain: string): Promise<SiteDataGroup | null> {
  const groups = await listSiteDataGroups(partition)
  return groups.find((g) => g.registrableDomain === domain) ?? null
}

/** Invalide le cache d'une partition (après une suppression de données). */
export function invalidateSiteDataCache(partition: string): void {
  cacheByPartition.delete(partition)
}
