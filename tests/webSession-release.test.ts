/**
 * `releasePrivatePartition`/`releaseCertificateObserver` — contrepartie du
 * durcissement paresseux (`hardened`/`observed`, jamais vidés avant cette
 * correction) pour une partition de navigation PRIVÉE dont le dernier
 * profil/fenêtre vient de disparaître. Régression : `ensurePartitionHardened`
 * ne redurcissait JAMAIS deux fois la même partition (garde `hardened`) —
 * sans `releasePrivatePartition`, une session Electron entière (permissions,
 * DNT, HTTPS d'abord, téléchargements) restait vivante en mémoire pour
 * chaque fenêtre privée ouverte puis fermée durant la vie du process, la
 * partition n'étant jamais réutilisée (UUID neuf à chaque fois).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeSession() {
  return {
    getUserAgent: vi.fn(() => 'Mozilla/5.0 Electron/30.0.0 aether-browser/0.80.2'),
    setUserAgent: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setCertificateVerifyProc: vi.fn(),
    setSpellCheckerLanguages: vi.fn(),
    setProxy: vi.fn(async () => undefined),
    clearStorageData: vi.fn(async () => undefined),
    on: vi.fn(),
    webRequest: {
      onBeforeSendHeaders: vi.fn(),
      onBeforeRequest: vi.fn(),
      onHeadersReceived: vi.fn()
    }
  }
}

const electronMock = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\Aether') },
  session: { fromPartition: vi.fn() }
}))
vi.mock('electron', () => electronMock)

vi.mock('../src/main/certificates', () => ({
  installCertificateObserver: vi.fn(),
  releaseCertificateObserver: vi.fn()
}))
vi.mock('../src/main/contentBlocking', () => ({
  contentBlockingBeforeRequest: vi.fn(() => null),
  contentBlockingHeadersReceived: vi.fn(() => null),
  shouldBlockAutoDownload: vi.fn(() => false)
}))
vi.mock('../src/main/db/repositories', () => ({
  downloadsRepo: { create: vi.fn(), updateProgress: vi.fn(), finish: vi.fn() },
  sitePermissionsRepo: { get: vi.fn(), touchUsed: vi.fn() }
}))
vi.mock('../src/main/permissionPromptWindow', () => ({ requestPermissionPrompt: vi.fn() }))
vi.mock('../src/main/settings', () => ({
  getSettings: vi.fn(() => ({
    doNotTrack: false,
    httpsOnly: false,
    askDownloadLocation: true,
    spellcheck: false,
    spellcheckLanguages: [],
    proxyMode: 'system',
    proxyRules: ''
  }))
}))
vi.mock('../src/main/windowRegistry', () => ({
  ownerContextForPageWebContents: vi.fn(() => null),
  windowContextsForProfile: vi.fn(() => [])
}))

const { ensurePartitionHardened, releasePrivatePartition } = await import('../src/main/webSession')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('releasePrivatePartition', () => {
  it('vide le stockage de la partition', () => {
    const fake = fakeSession()
    electronMock.session.fromPartition.mockReturnValue(fake)

    releasePrivatePartition('aether-private-abc')

    expect(electronMock.session.fromPartition).toHaveBeenCalledWith('aether-private-abc')
    expect(fake.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it("n'échoue jamais si le vidage rejette", () => {
    const fake = fakeSession()
    fake.clearStorageData.mockRejectedValueOnce(new Error('déjà détruite'))
    electronMock.session.fromPartition.mockReturnValue(fake)

    expect(() => releasePrivatePartition('aether-private-def')).not.toThrow()
  })

  it('permet à `ensurePartitionHardened` de redurcir la MÊME partition ensuite', () => {
    const fake = fakeSession()
    electronMock.session.fromPartition.mockReturnValue(fake)
    const partition = 'aether-private-ghi'

    ensurePartitionHardened(partition, 'profile-1')
    expect(fake.setUserAgent).toHaveBeenCalledTimes(1)

    // Idempotent tant que la partition reste dans `hardened` — même profil,
    // même appel : pas de second durcissement.
    ensurePartitionHardened(partition, 'profile-1')
    expect(fake.setUserAgent).toHaveBeenCalledTimes(1)

    releasePrivatePartition(partition)
    ensurePartitionHardened(partition, 'profile-1')
    expect(fake.setUserAgent).toHaveBeenCalledTimes(2)
  })
})
