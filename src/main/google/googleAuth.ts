/**
 * Connexion Google — OAuth 2.0 natif (RFC 8252, « native app »). Ouvre le
 * vrai navigateur système pour l'écran de consentement (jamais de webview
 * interne — c'est précisément ce qui permet d'éviter le blocage
 * anti-navigateur-intégré de Google), récupère le code d'autorisation via un
 * serveur HTTP loopback local, l'échange contre un jeton d'accès/
 * rafraîchissement. Ne délivre JAMAIS une session web cookie
 * (youtube.com/gmail.com) — uniquement un jeton Bearer pour les API REST
 * Google (voir googleApi.ts).
 */
import { createHash, randomBytes } from 'node:crypto'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'
import type { GoogleStatus } from '@shared/types'
import { AuthError } from '../ai/providers'
import { logger } from '../logger'
import {
  clearGoogleTokens,
  readGoogleClientConfig,
  readGoogleTokens,
  storeGoogleTokens,
  type GoogleClientConfig,
  type GoogleTokens
} from '../settings'
import { fetchUserInfo } from './googleApi'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/gmail.readonly'
].join(' ')
const LOOPBACK_TIMEOUT_MS = 120_000

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthUrl(clientId: string, redirectUri: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // access_type=offline + prompt=consent : garantit un refresh_token à
    // CHAQUE connexion (pas seulement la toute première autorisation), utile
    // après une reconnexion suivant une révocation côté utilisateur.
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/** Pure : extrait `code`/`error` d'une requête de callback et vérifie `state`
 * AVANT toute autre logique — testable sans socket réelle. Un `state` absent
 * ou différent rejette immédiatement, sans qu'aucun échange de code soit
 * tenté (protection CSRF, RFC 8252 §8.9). */
export function parseAuthCallback(reqUrl: string, expectedState: string): { code: string } | { error: string } {
  let url: URL
  try {
    url = new URL(reqUrl, 'http://127.0.0.1')
  } catch {
    return { error: 'url_invalide' }
  }
  const state = url.searchParams.get('state')
  if (!state || state !== expectedState) return { error: 'state_mismatch' }
  const error = url.searchParams.get('error')
  if (error) return { error }
  const code = url.searchParams.get('code')
  if (!code) return { error: 'code_absent' }
  return { code }
}

const CALLBACK_PAGE =
  '<!doctype html><html><head><meta charset="utf-8"><title>ÆTHER</title></head>' +
  '<body style="font-family:sans-serif;background:#0b0b10;color:#eee;display:flex;' +
  'align-items:center;justify-content:center;height:100vh;margin:0">' +
  '<p>Vous pouvez fermer cet onglet et revenir à ÆTHER.</p></body></html>'

/** Attend la PREMIÈRE requête reçue sur le serveur loopback (usage unique) et
 * ferme le serveur immédiatement après, succès ou échec confondus. Timeout de
 * sécurité si l'utilisateur ferme l'onglet ou n'autorise jamais — sans lui le
 * process main garderait un serveur HTTP ouvert indéfiniment. */
export function waitForCallback(server: http.Server, state: string, timeoutMs = LOOPBACK_TIMEOUT_MS): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      fn()
    }
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Connexion Google annulée ou expirée.')))
    }, timeoutMs)
    server.on('request', (req, res) => {
      if (settled || !req.url) return
      const result = parseAuthCallback(req.url, state)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(CALLBACK_PAGE)
      finish(() => {
        if ('error' in result) reject(new Error(`Connexion Google refusée (${result.error}).`))
        else resolve({ code: result.code })
      })
    })
  })
}

export async function exchangeCodeForTokens(
  client: GoogleClientConfig,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<Omit<GoogleTokens, 'email'>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = JSON.stringify(await res.json())
    } catch {
      // repli sur statusText déjà posé
    }
    throw new Error(`Google : échange du code refusé (${res.status}) — ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  if (!json.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de jeton de rafraîchissement — reconnectez-vous (prompt=consent aurait dû l'éviter)."
    )
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000 - 60_000
  }
}

/** Rafraîchit un jeton expiré. Sur `invalid_grant` (accès révoqué depuis
 * myaccount.google.com/permissions), purge les jetons stockés et lève une
 * `AuthError` — jamais de nouvelle tentative sur un refresh_token mort (même
 * contrat non-retryable que dans `ai/providers.ts`). */
export async function refreshAccessToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  const client = readGoogleClientConfig()
  if (!client) throw new Error('Client Google non configuré.')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    let errorCode = ''
    let detail = res.statusText
    try {
      const parsed = (await res.json()) as { error?: string; error_description?: string }
      errorCode = parsed.error ?? ''
      detail = parsed.error_description ?? errorCode ?? detail
    } catch {
      // repli sur statusText déjà posé
    }
    if (errorCode === 'invalid_grant') {
      clearGoogleTokens()
      throw new AuthError(`Compte Google déconnecté (accès révoqué) — reconnectez-vous. ${detail}`)
    }
    throw new Error(`Google : rafraîchissement refusé (${res.status}) — ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  const refreshed: GoogleTokens = {
    accessToken: json.access_token,
    // Google ne renvoie généralement pas de nouveau refresh_token sur ce
    // chemin — conserver l'ancien s'il est absent de la réponse.
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000 - 60_000,
    email: tokens.email
  }
  storeGoogleTokens(refreshed)
  return refreshed
}

// Verrou single-flight : deux appels concurrents (ex. youtubeSubscriptions()
// + gmailPreview() lancés en parallèle par l'UI) ne doivent pas déclencher
// deux rafraîchissements simultanés.
let refreshInFlight: Promise<GoogleTokens> | null = null

export async function getValidAccessToken(): Promise<string> {
  const tokens = readGoogleTokens()
  if (!tokens) throw new AuthError('Aucun compte Google connecté.')
  if (Date.now() < tokens.expiresAt) return tokens.accessToken
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(tokens).finally(() => {
      refreshInFlight = null
    })
  }
  const refreshed = await refreshInFlight
  return refreshed.accessToken
}

export function getCurrentGoogleStatus(): GoogleStatus {
  const tokens = readGoogleTokens()
  return tokens ? { connected: true, email: tokens.email } : { connected: false, email: null }
}

// Un second appel à `connectGoogleAccount()` pendant qu'un flux est déjà
// ouvert ferme le serveur loopback précédent plutôt que d'en ouvrir un second.
let pendingServer: http.Server | null = null

function cancelPendingFlow(): void {
  if (pendingServer) {
    try {
      pendingServer.close()
    } catch {
      // déjà fermé
    }
    pendingServer = null
  }
}

export async function connectGoogleAccount(): Promise<GoogleStatus> {
  cancelPendingFlow()
  const client = readGoogleClientConfig()
  if (!client) {
    throw new Error(
      "Aucun client Google configuré — créez un client OAuth « Desktop app » sur Google Cloud Console et posez AETHER_GOOGLE_CLIENT_ID/_SECRET dans .env.local avant de vous connecter."
    )
  }

  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))

  const server = http.createServer()
  pendingServer = server
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve(addr.port)
    })
  })

  const redirectUri = `http://127.0.0.1:${port}/callback`
  const codePromise = waitForCallback(server, state)
  const authUrl = buildAuthUrl(client.clientId, redirectUri, state, challenge)
  await shell.openExternal(authUrl)

  let code: string
  try {
    ;({ code } = await codePromise)
  } finally {
    if (pendingServer === server) pendingServer = null
  }

  const partial = await exchangeCodeForTokens(client, code, verifier, redirectUri)
  const info = await fetchUserInfo(partial.accessToken)
  const tokens: GoogleTokens = { ...partial, email: info.email }
  storeGoogleTokens(tokens)
  return { connected: true, email: info.email }
}

export function disconnectGoogleAccount(): void {
  cancelPendingFlow()
  const tokens = readGoogleTokens()
  clearGoogleTokens()
  if (tokens) {
    // Best-effort — l'utilisateur peut aussi révoquer depuis
    // myaccount.google.com/permissions, ceci n'est qu'une courtoisie.
    void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`, {
      method: 'POST'
    }).catch((err: unknown) => {
      logger.warn('google-auth', 'Révocation du jeton Google en échec (sans conséquence)', err)
    })
  }
}
