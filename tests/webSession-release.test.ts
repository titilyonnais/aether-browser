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
  // `getUserAgent` doit refléter le dernier `setUserAgent` — comme le fait
  // réellement Electron — sinon `getPartitionUserAgent` (qui relit l'UA de
  // la session APRÈS le nettoyage fait par `ensurePartitionHardened`) ne
  // pourrait pas être testée fidèlement.
  let currentUa =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) aether-browser/0.86.0 Chrome/128.0.6613.36 Electron/32.0.0 Safari/537.36'
  return {
    getUserAgent: vi.fn(() => currentUa),
    setUserAgent: vi.fn((ua: string) => {
      currentUa = ua
    }),
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

const {
  ensurePartitionHardened,
  releasePrivatePartition,
  getGoogleAccountsUserAgent,
  getPartitionUserAgent
} = await import('../src/main/webSession')

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

describe('getGoogleAccountsUserAgent — contournement du blocage Google des moteurs Chromium embarqués', () => {
  // Régression : Google refuse depuis juillet 2023 toute connexion à un
  // compte Google depuis un moteur Chromium EMBARQUÉ (Electron compris),
  // quelle que soit la qualité du User-Agent « normal » — un correctif déjà
  // tenté deux fois cette session (window.opener) sans jamais résoudre ce
  // blocage précis, puisque sa vraie cause est différente. `accounts.google.com`
  // reçoit un User-Agent Edge dédié, ancré sur la VRAIE version Chrome de la
  // session (jamais un numéro figé à la main).
  it('dérive un User-Agent Edge de la vraie version Chrome de la session', () => {
    const fake = fakeSession()
    electronMock.session.fromPartition.mockReturnValue(fake)
    const partition = 'persist:aether-web-profile-1'

    ensurePartitionHardened(partition, 'profile-1')

    const ua = getGoogleAccountsUserAgent(partition)
    expect(ua).toContain('Chrome/128.0.6613.36')
    expect(ua).toContain('Edg/128.0.6613.36')
  })

  it('renvoie null pour une partition pas encore durcie', () => {
    expect(getGoogleAccountsUserAgent('persist:jamais-durcie')).toBeNull()
  })

  it('getPartitionUserAgent renvoie le User-Agent normal (sans Edg) pour tout le reste de la navigation', () => {
    const fake = fakeSession()
    electronMock.session.fromPartition.mockReturnValue(fake)
    const partition = 'persist:aether-web-profile-2'

    ensurePartitionHardened(partition, 'profile-2')

    const ua = getPartitionUserAgent(partition)
    expect(ua).not.toContain('Edg/')
    expect(ua).not.toContain('Electron/')
  })
})
