/**
 * Appels API REST Google (YouTube Data API v3, Gmail API) authentifiés par
 * jeton Bearer — jamais de session cookie. Réutilise ensureOk/withRetry/
 * AuthError de ai/providers.ts (même contrat 401/403 non-retryable).
 */
import type { GmailPreviewMessage, YoutubeSubscription } from '@shared/types'
import { ensureOk, withRetry } from '../ai/providers'

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

/** Nombre max d'abonnements paginés — évite une pagination non bornée si un
 * compte suit un très grand nombre de chaînes. */
const MAX_SUBSCRIPTIONS = 200

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` }
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await withRetry(undefined, () => fetch(url, { headers: authHeaders(accessToken) }))
  await ensureOk(res, 'Google')
  return (await res.json()) as T
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string }> {
  const json = await getJson<{ email: string }>(USERINFO_URL, accessToken)
  return { email: json.email }
}

interface YoutubeSubscriptionsResponse {
  items: Array<{
    snippet: {
      title: string
      description: string
      publishedAt: string
      resourceId: { channelId: string }
      thumbnails?: { default?: { url: string } }
    }
  }>
  nextPageToken?: string
}

export async function fetchYoutubeSubscriptions(accessToken: string): Promise<YoutubeSubscription[]> {
  const subs: YoutubeSubscription[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50' })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await getJson<YoutubeSubscriptionsResponse>(
      `${YOUTUBE_BASE}/subscriptions?${params.toString()}`,
      accessToken
    )
    for (const item of page.items) {
      subs.push({
        channelId: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails?.default?.url ?? '',
        description: item.snippet.description,
        subscribedAt: item.snippet.publishedAt,
        recentActivityTitle: null,
        recentActivityAt: null
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken && subs.length < MAX_SUBSCRIPTIONS)

  await attachRecentActivity(subs, accessToken)
  return subs
}

interface YoutubeActivitiesResponse {
  items: Array<{ snippet: { title: string; publishedAt: string } }>
}

/** Dernière activité connue (upload, etc.) par chaîne — PAS un historique de
 * visionnage de l'utilisateur, l'API publique ne l'expose pas. Une chaîne en
 * échec (privée/supprimée) ne doit pas faire échouer tout l'appel. */
async function attachRecentActivity(subs: YoutubeSubscription[], accessToken: string): Promise<void> {
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const params = new URLSearchParams({ part: 'snippet', channelId: sub.channelId, maxResults: '1' })
        const page = await getJson<YoutubeActivitiesResponse>(
          `${YOUTUBE_BASE}/activities?${params.toString()}`,
          accessToken
        )
        const latest = page.items[0]
        if (latest) {
          sub.recentActivityTitle = latest.snippet.title
          sub.recentActivityAt = latest.snippet.publishedAt
        }
      } catch {
        // Sans conséquence pour les autres chaînes — voir commentaire ci-dessus.
      }
    })
  )
}

interface GmailListResponse {
  messages?: Array<{ id: string }>
}

interface GmailMessageResponse {
  id: string
  snippet: string
  internalDate: string
  labelIds?: string[]
  payload: { headers: Array<{ name: string; value: string }> }
}

function header(msg: GmailMessageResponse, name: string): string {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export async function fetchGmailPreview(accessToken: string, limit = 20): Promise<GmailPreviewMessage[]> {
  const listParams = new URLSearchParams({ maxResults: String(limit), labelIds: 'INBOX' })
  const list = await getJson<GmailListResponse>(
    `${GMAIL_BASE}/users/me/messages?${listParams.toString()}`,
    accessToken
  )
  const ids = list.messages ?? []
  const messages = await Promise.all(
    ids.map((m) => {
      const metaParams = new URLSearchParams({ format: 'metadata', metadataHeaders: 'From' })
      metaParams.append('metadataHeaders', 'Subject')
      return getJson<GmailMessageResponse>(
        `${GMAIL_BASE}/users/me/messages/${m.id}?${metaParams.toString()}`,
        accessToken
      )
    })
  )
  return messages.map((msg) => ({
    id: msg.id,
    from: header(msg, 'From'),
    subject: header(msg, 'Subject'),
    snippet: msg.snippet,
    receivedAt: Number(msg.internalDate),
    unread: (msg.labelIds ?? []).includes('UNREAD')
  }))
}
