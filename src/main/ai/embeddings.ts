/**
 * Premiers embeddings du graphe de connaissance personnel.
 * Chaque page visitée est encodée (titre + URL + extrait) ; les affinités
 * entre pages d'un même espace sont calculées par similarité cosinus et
 * dessinées dans la Constellation.
 */
import type { AffinityLink, SpaceId } from '@shared/types'
import { embeddingsRepo, pagesRepo } from '../db/repositories'
import type { AiRouter } from './router'

/** File d'attente simple : jamais plus d'un embedding à la fois. */
const queue: { pageId: string; text: string }[] = []
let running = false

export function queuePageEmbedding(router: AiRouter, pageId: string, text: string): void {
  if (!text.trim()) return
  const existing = queue.findIndex((q) => q.pageId === pageId)
  if (existing >= 0) queue.splice(existing, 1)
  queue.push({ pageId, text })
  void drain(router)
}

async function drain(router: AiRouter): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      // La page peut avoir été fermée entre-temps.
      if (!pagesRepo.get(item.pageId)) continue
      try {
        const result = await router.embed(item.text)
        if (result) {
          embeddingsRepo.upsert(item.pageId, 'page', result.model, result.vector)
        }
      } catch {
        // L'échec d'un embedding ne doit jamais perturber la navigation.
      }
    }
  } finally {
    running = false
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

const AFFINITY_THRESHOLD = 0.62
const MAX_LINKS = 14

/** Calcule les liens d'affinité sémantique entre pages d'un espace. */
export function computeAffinities(spaceId: SpaceId): AffinityLink[] {
  const pages = pagesRepo.listBySpace(spaceId)
  if (pages.length < 2) return []
  const rows = embeddingsRepo.forRefs(pages.map((p) => p.id))
  if (rows.length < 2) return []

  // Regroupe par modèle : deux vecteurs ne sont comparables qu'au sein du même espace vectoriel.
  const byModel = new Map<string, { id: string; vec: Float32Array }[]>()
  for (const row of rows) {
    const vec = new Float32Array(
      row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)
    )
    const list = byModel.get(row.model) ?? []
    list.push({ id: row.ref_id, vec })
    byModel.set(row.model, list)
  }

  const links: AffinityLink[] = []
  for (const group of byModel.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const score = cosine(group[i].vec, group[j].vec)
        if (score >= AFFINITY_THRESHOLD) {
          links.push({ a: group[i].id, b: group[j].id, score })
        }
      }
    }
  }
  links.sort((x, y) => y.score - x.score)
  return links.slice(0, MAX_LINKS)
}
