/**
 * `shouldBlockAutoDownload` retient, par `WebContents.id`, si cette page a
 * déjà eu un téléchargement depuis sa dernière navigation de premier niveau
 * (`downloadedSinceNav`) — le premier téléchargement est toujours autorisé,
 * un second sans navigation entre les deux est traité comme automatique.
 * Régression : seule `noteMainFrameNavigation` (navigation) purgeait cette
 * entrée — un onglet FERMÉ sans navigation ultérieure y restait indéfiniment,
 * une fuite non bornée sur une session longue. `noteWebContentsClosed`
 * (appelée depuis `ViewManager.destroyView`) comble ce trou.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/db/repositories', () => ({
  sitePermissionsRepo: { get: vi.fn(() => null) }
}))
vi.mock('../src/main/settings', () => ({
  getSettings: vi.fn(() => ({ allowAutoDownloads: false }))
}))

const { shouldBlockAutoDownload, noteMainFrameNavigation, noteWebContentsClosed } = await import(
  '../src/main/contentBlocking'
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('shouldBlockAutoDownload — cycle de vie de `downloadedSinceNav`', () => {
  it('autorise toujours le premier téléchargement, bloque le second sans navigation entre les deux', () => {
    expect(shouldBlockAutoDownload('profile-1', 'https://exemple.com', 42)).toBe(false)
    // Second téléchargement, même page, aucune navigation entre les deux —
    // traité comme automatique, soumis au réglage (ici désactivé par défaut
    // dans le mock `getSettings`, donc bloqué).
    expect(shouldBlockAutoDownload('profile-1', 'https://exemple.com', 42)).toBe(true)
  })

  it('noteMainFrameNavigation réautorise le prochain téléchargement de cette page', () => {
    shouldBlockAutoDownload('profile-1', 'https://exemple.com', 42)
    noteMainFrameNavigation(42)
    expect(shouldBlockAutoDownload('profile-1', 'https://exemple.com', 42)).toBe(false)
  })

  it('noteWebContentsClosed purge aussi l’entrée — un onglet fermé puis un id de webContents réutilisé ne reste pas marqué', () => {
    shouldBlockAutoDownload('profile-1', 'https://exemple.com', 99)
    noteWebContentsClosed(99)
    // Electron réutilise les ids de webContents au fil du temps — sans la
    // purge, ce nouvel onglet (même id, par coïncidence) hériterait à tort
    // du blocage laissé par l'ancien.
    expect(shouldBlockAutoDownload('profile-1', 'https://exemple.com', 99)).toBe(false)
  })
})
