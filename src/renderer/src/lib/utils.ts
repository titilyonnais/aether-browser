/** Petits utilitaires du renderer — zéro dépendance. */

/** Concatène des classes conditionnelles (clsx minimal). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function uuid(): string {
  return crypto.randomUUID()
}

/** Domaine lisible d'une URL (sans www.). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** URL de l'aperçu d'une page, versionnée pour invalider le cache. */
export function previewUrl(pageId: string, version: number): string | null {
  if (version <= 0) return null
  return `aether://previews/${pageId}.jpg?v=${version}`
}

/** Couleur HSL douce dérivée d'une teinte d'espace. */
export function hueColor(hue: number, alpha = 1, light = 72): string {
  return `hsl(${hue} 45% ${light}% / ${alpha})`
}

/** Teinte déterministe dérivée d'un domaine (cartes sans aperçu). */
export function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

/** Horodatage relatif en français, volontairement vague. */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 30) return `il y a ${d} j`
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Formate un nombre d'octets en unité lisible (Ko/Mo/Go). */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 o'
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

/** Durée lisible à partir de secondes (« 45 s », « 2 min 15 s », « 1 h 12 min »). */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return s % 60 ? `${min} min ${s % 60} s` : `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

/** Libellé de regroupement (Aujourd'hui/Hier/date) — les lignes elles-mêmes
 * n'affichent que l'heure (`timeOf`), le jour étant porté par l'en-tête de groupe. */
export function dayLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, now)) return "Aujourd'hui"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Hier'
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

export function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Groupe des éléments consécutifs par jour — la liste doit déjà être triée
 * par date décroissante (requête SQL), un simple passage suffit. */
export function groupByDay<T>(items: T[], tsOf: (item: T) => number): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const item of items) {
    const label = dayLabel(tsOf(item))
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** Débounce minimal. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
