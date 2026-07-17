/**
 * Tests du routeur IA — providers/réglages mockés (aucune dépendance réseau
 * ni Electron). Couvre le repli entre candidats et l'abandon en vol.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/types'

const settingsMock = vi.hoisted(() => ({
  getSettings: vi.fn(),
  hasSecret: vi.fn(),
  readSecret: vi.fn()
}))
vi.mock('../src/main/settings', () => settingsMock)

const providersMock = vi.hoisted(() => ({
  ollamaListModels: vi.fn(),
  ollamaChat: vi.fn(),
  ollamaEmbed: vi.fn(),
  anthropicChat: vi.fn(),
  openaiCompatChat: vi.fn(),
  openaiEmbed: vi.fn()
}))
vi.mock('../src/main/ai/providers', () => providersMock)

const { AiRouter } = await import('../src/main/ai/router')

function baseSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    aiProvider: 'auto',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: '',
    ollamaEmbedModel: '',
    anthropicModel: 'claude',
    openaiModel: 'gpt',
    xaiModel: 'grok',
    ...overrides
  } as AppSettings
}

beforeEach(() => {
  vi.resetAllMocks()
  settingsMock.getSettings.mockReturnValue(baseSettings())
  settingsMock.hasSecret.mockReturnValue(false)
  settingsMock.readSecret.mockReturnValue(null)
})

describe('AiRouter.chat — repli entre candidats', () => {
  it('bascule sur le candidat suivant si le premier échoue avant tout token', async () => {
    settingsMock.hasSecret.mockImplementation((k: string) => k === 'anthropic')
    settingsMock.readSecret.mockReturnValue('sk-ant')
    const router = new AiRouter()
    // Ollama joignable avec un modèle, en tête de liste (mode « auto »).
    ;(router as unknown as { status: { ollama: { reachable: boolean; models: string[] } } }).status.ollama = {
      reachable: true,
      models: ['llama3']
    }
    providersMock.ollamaChat.mockRejectedValue(new Error('connexion refusée'))
    providersMock.anthropicChat.mockResolvedValue(undefined)

    const used = await router.chat('req-1', 'system', [], () => {})

    expect(used).toBe('anthropic')
    expect(providersMock.ollamaChat).toHaveBeenCalledTimes(1)
    expect(providersMock.anthropicChat).toHaveBeenCalledTimes(1)
  })

  it('ne rejoue PAS sur un autre provider si des tokens ont déjà été émis', async () => {
    settingsMock.hasSecret.mockImplementation((k: string) => k === 'anthropic')
    const router = new AiRouter()
    ;(router as unknown as { status: { ollama: { reachable: boolean; models: string[] } } }).status.ollama = {
      reachable: true,
      models: ['llama3']
    }
    providersMock.ollamaChat.mockImplementation(async (_url: string, p: { onDelta: (t: string) => void }) => {
      p.onDelta('bonjour')
      throw new Error('coupure en plein flux')
    })

    await expect(router.chat('req-2', 'system', [], () => {})).rejects.toThrow('coupure en plein flux')
    expect(providersMock.anthropicChat).not.toHaveBeenCalled()
  })

  it('rejette si tous les candidats échouent', async () => {
    settingsMock.hasSecret.mockImplementation((k: string) => k === 'anthropic')
    settingsMock.readSecret.mockReturnValue('sk-ant')
    const router = new AiRouter()
    ;(router as unknown as { status: { ollama: { reachable: boolean; models: string[] } } }).status.ollama = {
      reachable: true,
      models: ['llama3']
    }
    providersMock.ollamaChat.mockRejectedValue(new Error('ollama down'))
    providersMock.anthropicChat.mockRejectedValue(new Error('clé invalide'))

    await expect(router.chat('req-3', 'system', [], () => {})).rejects.toThrow('clé invalide')
  })

  it("rejette immédiatement si aucun candidat n'est disponible", async () => {
    const router = new AiRouter()
    await expect(router.chat('req-4', 'system', [], () => {})).rejects.toThrow('Aucune intelligence disponible')
  })
})

describe('AiRouter.embed — repli Ollama → OpenAI', () => {
  it('utilise OpenAI si Ollama échoue et qu’une clé est configurée', async () => {
    settingsMock.getSettings.mockReturnValue(baseSettings({ ollamaEmbedModel: 'embed-model' }))
    settingsMock.hasSecret.mockImplementation((k: string) => k === 'openai')
    settingsMock.readSecret.mockReturnValue('sk-test')
    const router = new AiRouter()
    ;(router as unknown as { status: { ollama: { reachable: boolean; models: string[] } } }).status.ollama = {
      reachable: true,
      models: ['embed-model']
    }
    providersMock.ollamaEmbed.mockRejectedValue(new Error('ollama indisponible'))
    providersMock.openaiEmbed.mockResolvedValue(new Float32Array([1, 2, 3]))

    const result = await router.embed('texte')

    expect(result?.model).toBe('openai:text-embedding-3-small')
    expect(providersMock.ollamaEmbed).toHaveBeenCalledTimes(1)
    expect(providersMock.openaiEmbed).toHaveBeenCalledTimes(1)
  })

  it('renvoie null si aucun backend d’embedding n’est disponible', async () => {
    const router = new AiRouter()
    const result = await router.embed('texte')
    expect(result).toBeNull()
  })
})
