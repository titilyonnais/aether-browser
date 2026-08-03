/**
 * Stockage chiffré du compte Google (jetons + config client OAuth) dans
 * settings.ts — mêmes garanties que le reste des secrets (safeStorage/DPAPI,
 * repli `null` silencieux si déchiffrement impossible).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`enc(${s})`, 'utf8')),
  decryptString: vi.fn((buf: Buffer) => {
    const raw = buf.toString('utf8')
    const match = /^enc\((.*)\)$/.exec(raw)
    if (!match) throw new Error('clé illisible')
    return match[1]
  })
}))
vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

vi.mock('../src/main/db/repositories', () => ({
  kvRepo: {
    get: (key: string): string | null => store.get(key) ?? null,
    set: (key: string, value: string): void => {
      store.set(key, value)
    },
    remove: (key: string): void => {
      store.delete(key)
    }
  }
}))

const {
  storeGoogleTokens,
  readGoogleTokens,
  clearGoogleTokens,
  hasGoogleAccount,
  storeGoogleClientConfig,
  readGoogleClientConfig,
  seedGoogleClientFromEnv
} = await import('../src/main/settings')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
  process.env = { ...ORIGINAL_ENV }
  delete process.env.AETHER_GOOGLE_CLIENT_ID
  delete process.env.AETHER_GOOGLE_CLIENT_SECRET
})

describe('jetons Google — roundtrip chiffré', () => {
  it('hasGoogleAccount est faux tant que rien n’est stocké', () => {
    expect(hasGoogleAccount()).toBe(false)
    expect(readGoogleTokens()).toBeNull()
  })

  it('stocke puis relit les jetons à l’identique', () => {
    const tokens = { accessToken: 'at', refreshToken: 'rt', expiresAt: 123, email: 'user@example.com' }
    storeGoogleTokens(tokens)
    expect(hasGoogleAccount()).toBe(true)
    expect(readGoogleTokens()).toEqual(tokens)
  })

  it('clearGoogleTokens efface le compte', () => {
    storeGoogleTokens({ accessToken: 'at', refreshToken: 'rt', expiresAt: 123, email: 'user@example.com' })
    clearGoogleTokens()
    expect(hasGoogleAccount()).toBe(false)
    expect(readGoogleTokens()).toBeNull()
  })

  it('un échec de déchiffrement (profil changé) retourne null sans throw', () => {
    store.set('secret.google', 'enc:' + Buffer.from('donnée illisible', 'utf8').toString('base64'))
    expect(() => readGoogleTokens()).not.toThrow()
    expect(readGoogleTokens()).toBeNull()
  })
})

describe('config client OAuth Google', () => {
  it('storeGoogleClientConfig/readGoogleClientConfig roundtrip', () => {
    storeGoogleClientConfig({ clientId: 'id-1', clientSecret: 'secret-1' })
    expect(readGoogleClientConfig()).toEqual({ clientId: 'id-1', clientSecret: 'secret-1' })
  })

  it("seedGoogleClientFromEnv ne fait rien si les variables d'env sont absentes", () => {
    seedGoogleClientFromEnv()
    expect(readGoogleClientConfig()).toBeNull()
  })

  it("seedGoogleClientFromEnv chiffre une fois depuis l'environnement", () => {
    process.env.AETHER_GOOGLE_CLIENT_ID = 'env-id'
    process.env.AETHER_GOOGLE_CLIENT_SECRET = 'env-secret'
    seedGoogleClientFromEnv()
    expect(readGoogleClientConfig()).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('seedGoogleClientFromEnv ne remplace PAS un client déjà stocké', () => {
    storeGoogleClientConfig({ clientId: 'existing', clientSecret: 'existing-secret' })
    process.env.AETHER_GOOGLE_CLIENT_ID = 'env-id'
    process.env.AETHER_GOOGLE_CLIENT_SECRET = 'env-secret'
    seedGoogleClientFromEnv()
    expect(readGoogleClientConfig()).toEqual({ clientId: 'existing', clientSecret: 'existing-secret' })
  })
})
