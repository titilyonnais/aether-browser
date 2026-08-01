/**
 * `releaseCertificateObserver` — contrepartie de `installCertificateObserver`
 * pour une partition de navigation privée dont le dernier profil vient de
 * disparaître. Régression : `rawCertCache`/`observed` n'étaient jamais vidés
 * avant cette correction, accumulant une entrée par hôte visité dans CHAQUE
 * fenêtre privée jamais ouverte durant la vie du process — alors qu'un
 * onglet Certificat n'est, par définition, plus jamais consultable une fois
 * la fenêtre privée fermée.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  session: { fromPartition: vi.fn() }
}))
vi.mock('electron', () => electronMock)

// `getCertificateDetail` parse le certificat brut via `X509Certificate` de
// Node — hors de propos ici (on ne teste que le CACHE, pas le parsing) : un
// stub minimal suffit, sans clé/certificat réel à générer.
vi.mock('node:crypto', () => ({
  X509Certificate: vi.fn().mockImplementation(function FakeX509() {
    return {
      subject: 'CN=exemple.com',
      issuer: 'CN=exemple.com',
      publicKey: { export: () => Buffer.from('fake-key') },
      serialNumber: '01',
      fingerprint256: 'fake-fingerprint'
    }
  }),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'fake-digest')
  }))
}))

const { installCertificateObserver, releaseCertificateObserver, getCertificateDetail } = await import(
  '../src/main/certificates'
)

function fakeSession() {
  let verifyProc: ((request: unknown, callback: (v: number) => void) => void) | null = null
  return {
    setCertificateVerifyProc: vi.fn((fn) => {
      verifyProc = fn
    }),
    __verify(request: { hostname: string; certificate: unknown }) {
      verifyProc?.(request, () => undefined)
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('releaseCertificateObserver', () => {
  it('efface le cache de certificats de cette partition, sans toucher aux autres', () => {
    const fakeA = fakeSession()
    const fakeB = fakeSession()
    electronMock.session.fromPartition.mockImplementation((p: string) => (p === 'partition-a' ? fakeA : fakeB))

    installCertificateObserver('partition-a')
    installCertificateObserver('partition-b')
    fakeA.__verify({ hostname: 'exemple.com', certificate: { data: 'cert-a' } })
    fakeB.__verify({ hostname: 'exemple.com', certificate: { data: 'cert-b' } })

    releaseCertificateObserver('partition-a')

    expect(getCertificateDetail('partition-a', 'exemple.com')).toBeNull()
    // La partition qui n'a pas été libérée garde son cache intact — la
    // clé de cache est préfixée par partition précisément pour ça.
    expect(getCertificateDetail('partition-b', 'exemple.com')).not.toBeNull()
  })

  it("permet à `installCertificateObserver` de ré-observer la MÊME partition ensuite", () => {
    const fake = fakeSession()
    electronMock.session.fromPartition.mockReturnValue(fake)

    installCertificateObserver('partition-c')
    expect(fake.setCertificateVerifyProc).toHaveBeenCalledTimes(1)

    installCertificateObserver('partition-c')
    expect(fake.setCertificateVerifyProc).toHaveBeenCalledTimes(1)

    releaseCertificateObserver('partition-c')
    installCertificateObserver('partition-c')
    expect(fake.setCertificateVerifyProc).toHaveBeenCalledTimes(2)
  })
})
