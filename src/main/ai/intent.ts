/**
 * Classification d'intention côté main : heuristique instantanée,
 * raffinée par le provider IA actif quand c'est pertinent (avec timeout
 * court pour ne jamais bloquer la Barre d'Intention).
 */
import { heuristicClassify } from '@shared/intent'
import type { IntentResult } from '@shared/types'
import type { AiRouter } from './router'

const AI_TIMEOUT_MS = 1600

const CLASSIFY_SYSTEM = `Tu classifies l'entrée d'une barre d'intention de navigateur.
Réponds UNIQUEMENT avec un objet JSON compact, sans texte autour :
{"type":"url"|"search"|"intent","query":string?,"plan":"compare"|"ask"|"search-and-ask"?,"left":string?,"right":string?}
Règles : "url" seulement si c'est clairement une adresse web. "intent" pour les demandes
adressées à un assistant (comparer, résumer, rédiger, organiser…). Sinon "search".`

interface AiClassification {
  type?: string
  query?: string
  plan?: string
  left?: string
  right?: string
}

async function aiRefine(router: AiRouter, input: string): Promise<IntentResult | null> {
  let raw = ''
  const requestId = `intent-${Date.now()}`
  const run = router
    .chat(requestId, CLASSIFY_SYSTEM, [{ role: 'user', content: input }], (t) => {
      raw += t
    })
    .then(() => true)
    .catch(() => false)

  const timer = new Promise<false>((resolve) =>
    setTimeout(() => {
      router.abort(requestId)
      resolve(false)
    }, AI_TIMEOUT_MS)
  )

  const ok = await Promise.race([run, timer])
  if (!ok) return null

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as AiClassification
    if (parsed.type === 'search') {
      return { input, type: 'search', query: parsed.query || input, source: 'ai' }
    }
    if (parsed.type === 'intent') {
      const result: IntentResult = { input, type: 'intent', query: parsed.query || input, source: 'ai' }
      if (parsed.plan === 'compare' && parsed.left && parsed.right) {
        result.plan = { kind: 'compare', left: parsed.left, right: parsed.right }
      } else if (parsed.plan === 'search-and-ask') {
        result.plan = { kind: 'search-and-ask' }
      } else {
        result.plan = { kind: 'ask' }
      }
      return result
    }
    return null // "url" décidée par l'IA : on ne fait jamais confiance, l'heuristique prime
  } catch {
    return null
  }
}

export async function classifyIntent(router: AiRouter, input: string): Promise<IntentResult> {
  const heuristic = heuristicClassify(input)

  // Les URLs et les entrées courtes ne méritent pas un aller-retour IA.
  const worthAi =
    heuristic.type !== 'url' &&
    input.length > 14 &&
    /\s/.test(input.trim()) &&
    router.getStatus().active !== 'none'

  if (!worthAi) return heuristic

  const refined = await aiRefine(router, input)
  return refined ?? heuristic
}
