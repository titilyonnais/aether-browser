/**
 * Routeur IA hybride : local d'abord (Ollama), APIs ensuite.
 * - Mode « auto » : Ollama si joignable, sinon première clé API configurée.
 * - Fallback transparent : si le provider choisi échoue avant le premier
 *   token, on tente le candidat suivant.
 */
import type { AiStatus, ApiProviderKind, ChatMessage, ProviderKind } from '@shared/types'
import { logger } from '../logger'
import { getAiCloudUsage, getSettings, hasSecret, readSecret, tryConsumeAiCloudBudget } from '../settings'
import {
  anthropicChat,
  ollamaChat,
  ollamaEmbed,
  ollamaListModels,
  openaiCompatChat,
  openaiEmbed,
  type ChatParams
} from './providers'

interface ResolvedProvider {
  kind: ProviderKind
  model: string
}

export class AiRouter {
  private status: AiStatus = {
    ollama: { reachable: false, baseUrl: 'http://127.0.0.1:11434', models: [] },
    configured: { anthropic: false, openai: false, xai: false },
    active: 'none',
    activeModel: null,
    embeddings: 'none',
    cloudBudget: { count: 0, limit: 0 }
  }

  private aborters = new Map<string, AbortController>()
  onStatusChanged: ((s: AiStatus) => void) | null = null

  getStatus(): AiStatus {
    return this.status
  }

  /** Sonde Ollama et recalcule le provider actif. */
  async refreshStatus(): Promise<AiStatus> {
    const settings = getSettings()
    let models: string[] = []
    let reachable = false
    try {
      models = await ollamaListModels(settings.ollamaBaseUrl)
      reachable = true
    } catch {
      // Ollama éteint ou absent — parfaitement acceptable.
    }
    const configured: Record<ApiProviderKind, boolean> = {
      anthropic: hasSecret('anthropic'),
      openai: hasSecret('openai'),
      xai: hasSecret('xai')
    }
    this.status = {
      ollama: { reachable, baseUrl: settings.ollamaBaseUrl, models },
      configured,
      active: 'none',
      activeModel: null,
      embeddings: 'none',
      cloudBudget: getAiCloudUsage()
    }
    const resolved = this.resolveCandidates()[0] ?? null
    if (resolved) {
      this.status.active = resolved.kind
      this.status.activeModel = resolved.model
    }
    if (this.pickEmbedModel()) this.status.embeddings = 'ollama'
    else if (configured.openai) this.status.embeddings = 'openai'
    this.onStatusChanged?.(this.status)
    return this.status
  }

  /** Modèle de chat Ollama : réglage explicite sinon premier modèle non-embed. */
  private pickOllamaModel(): string | null {
    const settings = getSettings()
    const chatModels = this.status.ollama.models.filter((m) => !m.includes('embed'))
    if (settings.ollamaModel && this.status.ollama.models.includes(settings.ollamaModel)) {
      return settings.ollamaModel
    }
    if (settings.ollamaModel) return settings.ollamaModel // modèle non listé mais forcé
    return chatModels[0] ?? null
  }

  /** Modèle d'embedding Ollama : réglage explicite sinon détection `*embed*`. */
  private pickEmbedModel(): string | null {
    const settings = getSettings()
    if (!this.status.ollama.reachable) return null
    if (settings.ollamaEmbedModel) return settings.ollamaEmbedModel
    return this.status.ollama.models.find((m) => m.includes('embed')) ?? null
  }

  /** Liste ordonnée des providers utilisables selon le réglage. */
  private resolveCandidates(): ResolvedProvider[] {
    const settings = getSettings()
    const out: ResolvedProvider[] = []
    const pushOllama = (): void => {
      const model = this.status.ollama.reachable ? this.pickOllamaModel() : null
      if (model) out.push({ kind: 'ollama', model })
    }
    const pushApi = (kind: ApiProviderKind): void => {
      if (!hasSecret(kind)) return
      const model =
        kind === 'anthropic'
          ? settings.anthropicModel
          : kind === 'openai'
            ? settings.openaiModel
            : settings.xaiModel
      out.push({ kind, model })
    }
    if (settings.aiProvider === 'auto') {
      pushOllama()
      pushApi('anthropic')
      pushApi('openai')
      pushApi('xai')
    } else if (settings.aiProvider === 'ollama') {
      pushOllama()
    } else {
      pushApi(settings.aiProvider)
    }
    return out
  }

  /**
   * Lance une conversation en streaming. Le fallback ne s'applique que si
   * aucun token n'a encore été émis (échec de connexion immédiat).
   */
  async chat(
    requestId: string,
    system: string,
    messages: ChatMessage[],
    onDelta: (text: string) => void
  ): Promise<ProviderKind> {
    const candidates = this.resolveCandidates()
    if (candidates.length === 0) {
      throw new Error(
        "Aucune intelligence disponible. Lancez Ollama en local ou ajoutez une clé API dans les paramètres."
      )
    }
    const controller = new AbortController()
    this.aborters.set(requestId, controller)
    let emitted = false
    const wrappedDelta = (t: string): void => {
      emitted = true
      onDelta(t)
    }
    try {
      let lastError: Error | null = null
      for (const candidate of candidates) {
        if (controller.signal.aborted) break
        try {
          await this.runCandidate(candidate, {
            model: candidate.model,
            system,
            messages,
            signal: controller.signal,
            onDelta: wrappedDelta
          })
          return candidate.kind
        } catch (e) {
          if (controller.signal.aborted) return candidate.kind
          lastError = e instanceof Error ? e : new Error(String(e))
          logger.warn('ai.router', `Échec du provider ${candidate.kind}, passage au suivant`, lastError)
          if (emitted) throw lastError // flux entamé : ne pas rejouer sur un autre provider
        }
      }
      if (controller.signal.aborted) return candidates[0].kind
      throw lastError ?? new Error('Aucun provider IA disponible.')
    } finally {
      this.aborters.delete(requestId)
    }
  }

  private async runCandidate(candidate: ResolvedProvider, params: ChatParams): Promise<void> {
    const settings = getSettings()
    switch (candidate.kind) {
      case 'ollama':
        return ollamaChat(settings.ollamaBaseUrl, params)
      case 'anthropic': {
        const key = readSecret('anthropic')
        if (!key) throw new Error('Clé Claude absente.')
        this.consumeCloudBudgetOrThrow()
        return anthropicChat(key, params)
      }
      case 'openai': {
        const key = readSecret('openai')
        if (!key) throw new Error('Clé OpenAI absente.')
        this.consumeCloudBudgetOrThrow()
        return openaiCompatChat('https://api.openai.com/v1', key, 'OpenAI', params)
      }
      case 'xai': {
        const key = readSecret('xai')
        if (!key) throw new Error('Clé xAI absente.')
        this.consumeCloudBudgetOrThrow()
        return openaiCompatChat('https://api.x.ai/v1', key, 'xAI', params)
      }
    }
  }

  /** Décrémente le plafond quotidien d'appels IA cloud avant l'appel réel —
   * jamais pour Ollama (local, gratuit). Lève une erreur claire (plutôt que
   * de tomber silencieusement dans le candidat suivant, ce qui masquerait un
   * plafond réellement atteint derrière un simple « échec du provider ») si
   * le plafond du jour est déjà consommé, et notifie l'UI du nouveau compte
   * pour un affichage à jour (Réglages › IA) sans re-sonder Ollama. */
  private consumeCloudBudgetOrThrow(): void {
    const ok = tryConsumeAiCloudBudget()
    this.status = { ...this.status, cloudBudget: getAiCloudUsage() }
    this.onStatusChanged?.(this.status)
    if (!ok) {
      throw new Error(
        `Plafond quotidien d'appels IA cloud atteint (${this.status.cloudBudget.limit}/jour) — réessayez demain ou augmentez la limite dans Réglages › IA.`
      )
    }
  }

  abort(requestId: string): void {
    this.aborters.get(requestId)?.abort()
    this.aborters.delete(requestId)
  }

  /**
   * Calcule un embedding avec le meilleur backend disponible.
   * Retourne null si aucun backend d'embedding n'est configuré.
   */
  async embed(text: string): Promise<{ vector: Float32Array; model: string } | null> {
    const settings = getSettings()
    const ollamaModel = this.pickEmbedModel()
    if (ollamaModel) {
      try {
        const vector = await ollamaEmbed(settings.ollamaBaseUrl, ollamaModel, text.slice(0, 6000))
        return { vector, model: `ollama:${ollamaModel}` }
      } catch (e) {
        // Repli vers OpenAI si configuré — journalisé quand même : sans ça,
        // rien n'indiquait jamais qu'Ollama avait échoué à ce moment précis.
        logger.warn('ai.router', "Échec de l'embedding Ollama, repli vers OpenAI si configuré", e)
      }
    }
    const openaiKey = readSecret('openai')
    if (openaiKey) {
      if (!tryConsumeAiCloudBudget()) {
        this.status = { ...this.status, cloudBudget: getAiCloudUsage() }
        this.onStatusChanged?.(this.status)
        logger.warn('ai.router', "Plafond quotidien d'appels IA cloud atteint — embedding OpenAI abandonné")
        return null
      }
      this.status = { ...this.status, cloudBudget: getAiCloudUsage() }
      this.onStatusChanged?.(this.status)
      try {
        const vector = await openaiEmbed(openaiKey, 'text-embedding-3-small', text)
        return { vector, model: 'openai:text-embedding-3-small' }
      } catch (e) {
        logger.error('ai.router', "Échec de l'embedding OpenAI — aucun backend disponible, embedding abandonné", e)
        return null
      }
    }
    return null
  }
}
