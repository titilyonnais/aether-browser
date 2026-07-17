/**
 * Clients bas-niveau des providers IA. Chaque fonction gère le streaming
 * (NDJSON pour Ollama, SSE pour les APIs) et pousse les deltas via onDelta.
 * Aucune logique de sélection ici — voir router.ts.
 */
import type { ChatMessage } from '@shared/types'

export interface ChatParams {
  model: string
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
}

/** Lit un flux HTTP ligne par ligne (NDJSON ou SSE). */
async function readLines(
  res: Response,
  onLine: (line: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (!res.body) throw new Error('Réponse sans corps')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    if (signal.aborted) {
      await reader.cancel()
      return
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (line.trim() !== '') onLine(line)
    }
  }
  if (buffer.trim() !== '') onLine(buffer)
}

/** Levé par `ensureOk` pour une erreur d'authentification (401/403) — jamais
 * transitoire, retenter avec la MÊME clé ne peut qu'échouer à l'identique. */
class AuthError extends Error {}

async function ensureOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } | string }
    detail =
      typeof body.error === 'string' ? body.error : (body.error?.message ?? JSON.stringify(body))
  } catch {
    detail = res.statusText
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`${provider} : clé API refusée (${res.status}). Vérifiez-la dans les paramètres.`)
  }
  throw new Error(`${provider} : erreur ${res.status} — ${detail.slice(0, 200)}`)
}

/** Nouvelle tentative avec back-off exponentiel (3 essais max, 300ms/600ms
 * entre chacun) — UNIQUEMENT pour des échecs transitoires plausibles (erreur
 * réseau, timeout, statut serveur) : jamais sur un signal déjà abandonné
 * (l'utilisateur a annulé) ni sur une clé API refusée (retenter à l'identique
 * ne peut qu'échouer pareil). Réservé aux appels ATOMIQUES (liste de modèles,
 * embedding) ou à la seule phase de CONNEXION d'un appel en streaming — une
 * fois le premier delta réellement émis au renderer, un nouvel essai
 * dupliquerait/corromprait la réponse déjà partiellement affichée (voir
 * `AiRouter.chat`, qui applique la même règle entre providers différents). */
async function withRetry<T>(signal: AbortSignal | undefined, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Annulé')
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (e instanceof AuthError) throw e
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt))
      }
    }
  }
  throw lastErr
}

// ─── Ollama (local) ──────────────────────────────────────────────────────────

export async function ollamaListModels(baseUrl: string, timeoutMs = 1500): Promise<string[]> {
  // PAS de retry ici volontairement : cette sonde tourne en arrière-plan à
  // chaque `refreshStatus()`, avec un timeout COURT délibéré — Ollama absent/
  // éteint est l'état le plus fréquent et parfaitement normal (pas une panne
  // transitoire à retenter), retenter ajouterait plusieurs secondes de
  // latence perçue pour le cas courant sans aucun bénéfice réel.
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`Ollama : ${res.status}`)
  const data = (await res.json()) as { models?: { name: string }[] }
  return (data.models ?? []).map((m) => m.name)
}

export async function ollamaChat(baseUrl: string, p: ChatParams): Promise<void> {
  // Retry sur la seule phase de CONNEXION (avant tout `onDelta`) — une fois
  // le flux entamé, `readLines` n'est plus retenté (voir `withRetry`).
  const res = await withRetry(p.signal, async () => {
    const r = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: p.signal,
      body: JSON.stringify({
        model: p.model,
        stream: true,
        messages: [{ role: 'system', content: p.system }, ...p.messages]
      })
    })
    await ensureOk(r, 'Ollama')
    return r
  })
  await readLines(
    res,
    (line) => {
      try {
        const json = JSON.parse(line) as { message?: { content?: string }; error?: string }
        if (json.error) throw new Error(json.error)
        const delta = json.message?.content
        if (delta) p.onDelta(delta)
      } catch (e) {
        if (e instanceof SyntaxError) return // ligne partielle, ignorée
        throw e
      }
    },
    p.signal
  )
}

export async function ollamaEmbed(
  baseUrl: string,
  model: string,
  text: string
): Promise<Float32Array> {
  return withRetry(undefined, async () => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ model, prompt: text })
    })
    await ensureOk(res, 'Ollama')
    const data = (await res.json()) as { embedding?: number[] }
    if (!data.embedding?.length) throw new Error('Ollama : embedding vide')
    return Float32Array.from(data.embedding)
  })
}

// ─── Anthropic (Claude) ──────────────────────────────────────────────────────

export async function anthropicChat(apiKey: string, p: ChatParams): Promise<void> {
  const res = await withRetry(p.signal, async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      signal: p.signal,
      body: JSON.stringify({
        model: p.model,
        max_tokens: 1536,
        stream: true,
        system: p.system,
        messages: p.messages
      })
    })
    await ensureOk(r, 'Claude')
    return r
  })
  await readLines(
    res,
    (line) => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (payload === '' || payload === '[DONE]') return
      try {
        const json = JSON.parse(payload) as {
          type?: string
          delta?: { type?: string; text?: string }
          error?: { message?: string }
        }
        if (json.type === 'error') throw new Error(json.error?.message ?? 'Erreur Claude')
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
          p.onDelta(json.delta.text)
        }
      } catch (e) {
        if (e instanceof SyntaxError) return
        throw e
      }
    },
    p.signal
  )
}

// ─── OpenAI & xAI (API compatible chat/completions) ─────────────────────────

export async function openaiCompatChat(
  baseUrl: string,
  apiKey: string,
  providerLabel: string,
  p: ChatParams
): Promise<void> {
  const res = await withRetry(p.signal, async () => {
    const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: p.signal,
      body: JSON.stringify({
        model: p.model,
        stream: true,
        messages: [{ role: 'system', content: p.system }, ...p.messages]
      })
    })
    await ensureOk(r, providerLabel)
    return r
  })
  await readLines(
    res,
    (line) => {
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (payload === '' || payload === '[DONE]') return
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[]
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) p.onDelta(delta)
      } catch (e) {
        if (e instanceof SyntaxError) return
        throw e
      }
    },
    p.signal
  )
}

export async function openaiEmbed(
  apiKey: string,
  model: string,
  text: string
): Promise<Float32Array> {
  return withRetry(undefined, async () => {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ model, input: text.slice(0, 8000) })
    })
    await ensureOk(res, 'OpenAI')
    const data = (await res.json()) as { data?: { embedding: number[] }[] }
    const vec = data.data?.[0]?.embedding
    if (!vec?.length) throw new Error('OpenAI : embedding vide')
    return Float32Array.from(vec)
  })
}
