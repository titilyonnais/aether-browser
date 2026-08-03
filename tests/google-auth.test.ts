/**
 * Flux OAuth Google (natif, RFC 8252) — settings mockées, aucune socket ni
 * appel réseau réel. Couvre la vérification `state` (CSRF), l'échange/
 * rafraîchissement de jetons et le verrou single-flight de `getValidAccessToken`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleTokens } from '../src/main/settings'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const settingsMock = vi.hoisted(() => ({
  readGoogleClientConfig: vi.fn(),
  readGoogleTokens: vi.fn(),
  storeGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn()
}))
vi.mock('../src/main/settings', () => settingsMock)

const loggerMock = vi.hoisted(() => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('../src/main/logger', () => loggerMock)

const googleApiMock = vi.hoisted(() => ({ fetchUserInfo: vi.fn() }))
vi.mock('../src/main/google/googleApi', () => googleApiMock)

const {
  buildAuthUrl,
  parseAuthCallback,
  waitForCallback,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken
} = await import('../src/main/google/googleAuth')

const CLIENT = { clientId: 'client-123', clientSecret: 'secret-abc' }

function fetchOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, statusText: 'OK' } as Response
}

function fetchErr(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body, statusText: 'Bad Request' } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('buildAuthUrl', () => {
  it('inclut PKCE S256, state et prompt=consent', () => {
    const url = new URL(buildAuthUrl('client-1', 'http://127.0.0.1:4000/callback', 'state-1', 'challenge-1'))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('access_type')).toBe('offline')
  })
})

describe('parseAuthCallback', () => {
  it('accepte un state correct', () => {
    const result = parseAuthCallback('/callback?state=abc&code=xyz', 'abc')
    expect(result).toEqual({ code: 'xyz' })
  })

  it('rejette un state absent', () => {
    const result = parseAuthCallback('/callback?code=xyz', 'abc')
    expect(result).toEqual({ error: 'state_mismatch' })
  })

  it('rejette un state différent — AUCUN échange de code tenté ensuite', () => {
    const result = parseAuthCallback('/callback?state=wrong&code=xyz', 'abc')
    expect(result).toEqual({ error: 'state_mismatch' })
  })

  it("relaie l'erreur renvoyée par Google (ex. access_denied)", () => {
    const result = parseAuthCallback('/callback?state=abc&error=access_denied', 'abc')
    expect(result).toEqual({ error: 'access_denied' })
  })
})

function fakeServer(): {
  server: { on: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  emit: (event: string, ...args: unknown[]) => void
} {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  const server = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      ;(listeners[event] ??= []).push(cb)
    }),
    close: vi.fn()
  }
  return { server, emit: (event, ...args) => (listeners[event] ?? []).forEach((cb) => cb(...args)) }
}

describe('waitForCallback', () => {
  it('résout avec le code sur une requête valide et ferme le serveur', async () => {
    const { server, emit } = fakeServer()
    const promise = waitForCallback(server as unknown as Parameters<typeof waitForCallback>[0], 'state-1', 5000)
    const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse
    emit('request', { url: '/callback?state=state-1&code=abc' } as IncomingMessage, res)
    await expect(promise).resolves.toEqual({ code: 'abc' })
    expect(server.close).toHaveBeenCalledTimes(1)
    expect(res.end).toHaveBeenCalled()
  })

  it('rejette et ferme le serveur si le timeout expire sans requête', async () => {
    vi.useFakeTimers()
    const { server } = fakeServer()
    const promise = waitForCallback(server as unknown as Parameters<typeof waitForCallback>[0], 'state-1', 1000)
    const assertion = expect(promise).rejects.toThrow(/annulée ou expirée/)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(server.close).toHaveBeenCalledTimes(1)
  })

  it('rejette sur un state invalide sans planter', async () => {
    const { server, emit } = fakeServer()
    const promise = waitForCallback(server as unknown as Parameters<typeof waitForCallback>[0], 'state-1', 5000)
    const res = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse
    emit('request', { url: '/callback?state=wrong&code=abc' } as IncomingMessage, res)
    await expect(promise).rejects.toThrow(/refusée/)
    expect(server.close).toHaveBeenCalledTimes(1)
  })
})

describe('exchangeCodeForTokens', () => {
  it('envoie grant_type=authorization_code avec code_verifier et calcule expiresAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.mocked(fetch).mockResolvedValue(
      fetchOk({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 })
    )

    const tokens = await exchangeCodeForTokens(CLIENT, 'code-1', 'verifier-1', 'http://127.0.0.1:4000/callback')

    expect(fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' })
    )
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = init?.body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe('verifier-1')
    expect(body.get('client_secret')).toBe('secret-abc')
    expect(tokens).toEqual({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 3600 * 1000 - 60_000
    })
  })

  it("lève une erreur claire si Google ne renvoie pas de refresh_token", async () => {
    vi.mocked(fetch).mockResolvedValue(fetchOk({ access_token: 'at-1', expires_in: 3600 }))
    await expect(exchangeCodeForTokens(CLIENT, 'code-1', 'v', 'http://127.0.0.1:4000/callback')).rejects.toThrow(
      /rafraîchissement/
    )
  })
})

describe('refreshAccessToken', () => {
  const oldTokens: GoogleTokens = {
    accessToken: 'old-at',
    refreshToken: 'old-rt',
    expiresAt: 0,
    email: 'user@example.com'
  }

  it('conserve l’ancien refresh_token si absent de la réponse', async () => {
    settingsMock.readGoogleClientConfig.mockReturnValue(CLIENT)
    vi.mocked(fetch).mockResolvedValue(fetchOk({ access_token: 'new-at', expires_in: 3600 }))

    const refreshed = await refreshAccessToken(oldTokens)

    expect(refreshed.refreshToken).toBe('old-rt')
    expect(refreshed.accessToken).toBe('new-at')
    expect(settingsMock.storeGoogleTokens).toHaveBeenCalledWith(refreshed)
  })

  it('purge les jetons et lève une AuthError sur invalid_grant', async () => {
    settingsMock.readGoogleClientConfig.mockReturnValue(CLIENT)
    vi.mocked(fetch).mockResolvedValue(
      fetchErr(400, { error: 'invalid_grant', error_description: 'Token has been revoked' })
    )

    await expect(refreshAccessToken(oldTokens)).rejects.toThrow(/révoqué/)
    expect(settingsMock.clearGoogleTokens).toHaveBeenCalledTimes(1)
  })
})

describe('getValidAccessToken', () => {
  it("retourne le jeton stocké tel quel s'il n'est pas expiré", async () => {
    settingsMock.readGoogleTokens.mockReturnValue({
      accessToken: 'valid-at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 100_000,
      email: 'user@example.com'
    })

    await expect(getValidAccessToken()).resolves.toBe('valid-at')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rafraîchit si le jeton stocké est expiré', async () => {
    settingsMock.readGoogleTokens.mockReturnValue({
      accessToken: 'expired-at',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
      email: 'user@example.com'
    })
    settingsMock.readGoogleClientConfig.mockReturnValue(CLIENT)
    vi.mocked(fetch).mockResolvedValue(fetchOk({ access_token: 'refreshed-at', expires_in: 3600 }))

    await expect(getValidAccessToken()).resolves.toBe('refreshed-at')
  })

  it('lève une erreur claire si aucun compte Google connecté', async () => {
    settingsMock.readGoogleTokens.mockReturnValue(null)
    await expect(getValidAccessToken()).rejects.toThrow(/Aucun compte Google connecté/)
  })

  it('ne déclenche qu’UN SEUL rafraîchissement pour deux appels concurrents (single-flight)', async () => {
    settingsMock.readGoogleTokens.mockReturnValue({
      accessToken: 'expired-at',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
      email: 'user@example.com'
    })
    settingsMock.readGoogleClientConfig.mockReturnValue(CLIENT)
    vi.mocked(fetch).mockResolvedValue(fetchOk({ access_token: 'refreshed-at', expires_in: 3600 }))

    const [a, b] = await Promise.all([getValidAccessToken(), getValidAccessToken()])

    expect(a).toBe('refreshed-at')
    expect(b).toBe('refreshed-at')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
