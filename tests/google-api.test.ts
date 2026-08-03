/**
 * Appels API REST Google (YouTube Data API v3, Gmail API) — fetch mocké,
 * vérifie le mapping vers les types partagés, la pagination bornée des
 * abonnements et la propagation d'une 401 en AuthError (non-retryable).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '../src/main/ai/providers'
import { fetchGmailPreview, fetchUserInfo, fetchYoutubeSubscriptions } from '../src/main/google/googleApi'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('fetchUserInfo', () => {
  it("retourne l'email de l'utilisateur", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ email: 'user@example.com' }))
    await expect(fetchUserInfo('token')).resolves.toEqual({ email: 'user@example.com' })
  })

  it('une 401 lève une AuthError', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { message: 'invalid credentials' } }, false, 401))
    await expect(fetchUserInfo('token')).rejects.toThrow(AuthError)
  })
})

describe('fetchYoutubeSubscriptions', () => {
  it('mappe subscriptions.list vers YoutubeSubscription[] avec activité récente', async () => {
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/subscriptions')) {
        return jsonResponse({
          items: [
            {
              snippet: {
                title: 'Chaîne Test',
                description: 'Une chaîne',
                publishedAt: '2025-01-01T00:00:00Z',
                resourceId: { channelId: 'chan-1' },
                thumbnails: { default: { url: 'https://img/chan-1.jpg' } }
              }
            }
          ]
        })
      }
      if (u.includes('/activities')) {
        return jsonResponse({ items: [{ snippet: { title: 'Nouvelle vidéo', publishedAt: '2025-06-01T00:00:00Z' } }] })
      }
      throw new Error(`URL inattendue: ${u}`)
    })

    const subs = await fetchYoutubeSubscriptions('token')

    expect(subs).toEqual([
      {
        channelId: 'chan-1',
        title: 'Chaîne Test',
        thumbnailUrl: 'https://img/chan-1.jpg',
        description: 'Une chaîne',
        subscribedAt: '2025-01-01T00:00:00Z',
        recentActivityTitle: 'Nouvelle vidéo',
        recentActivityAt: '2025-06-01T00:00:00Z'
      }
    ])
  })

  it('pagine jusqu’à épuisement de nextPageToken', async () => {
    let call = 0
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/activities')) return jsonResponse({ items: [] })
      call++
      if (call === 1) {
        return jsonResponse({
          items: [
            {
              snippet: {
                title: 'Chaîne 1',
                description: '',
                publishedAt: '2025-01-01T00:00:00Z',
                resourceId: { channelId: 'c1' }
              }
            }
          ],
          nextPageToken: 'page-2'
        })
      }
      return jsonResponse({
        items: [
          {
            snippet: {
              title: 'Chaîne 2',
              description: '',
              publishedAt: '2025-01-02T00:00:00Z',
              resourceId: { channelId: 'c2' }
            }
          }
        ]
      })
    })

    const subs = await fetchYoutubeSubscriptions('token')
    expect(subs.map((s) => s.channelId)).toEqual(['c1', 'c2'])
  })

  it('une chaîne dont l’activité échoue ne fait pas échouer tout l’appel', async () => {
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/subscriptions')) {
        return jsonResponse({
          items: [
            {
              snippet: {
                title: 'Chaîne',
                description: '',
                publishedAt: '2025-01-01T00:00:00Z',
                resourceId: { channelId: 'c1' }
              }
            }
          ]
        })
      }
      return jsonResponse({ error: 'forbidden' }, false, 403)
    })

    const subs = await fetchYoutubeSubscriptions('token')
    expect(subs[0].recentActivityTitle).toBeNull()
  })
})

describe('fetchGmailPreview', () => {
  it('mappe messages.list + messages.get vers GmailPreviewMessage[]', async () => {
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/messages?')) {
        return jsonResponse({ messages: [{ id: 'm1' }] })
      }
      return jsonResponse({
        id: 'm1',
        snippet: 'Bonjour…',
        internalDate: '1700000000000',
        labelIds: ['INBOX', 'UNREAD'],
        payload: {
          headers: [
            { name: 'From', value: 'expediteur@example.com' },
            { name: 'Subject', value: 'Objet du message' }
          ]
        }
      })
    })

    const messages = await fetchGmailPreview('token', 20)

    expect(messages).toEqual([
      {
        id: 'm1',
        from: 'expediteur@example.com',
        subject: 'Objet du message',
        snippet: 'Bonjour…',
        receivedAt: 1700000000000,
        unread: true
      }
    ])
  })
})
