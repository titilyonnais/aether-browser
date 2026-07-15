/**
 * Observation des certificats TLS — jamais de décision de confiance ici.
 *
 * `session.setCertificateVerifyProc` REMPLACE la vérification par défaut si on
 * la laisse faire ; on l'utilise uniquement pour CAPTURER les détails du
 * certificat de chaque hôte visité, puis on rend systématiquement `-3` pour
 * déléguer la décision réelle au vérificateur Chromium intégré. ÆTHER ne
 * décide jamais elle-même si un certificat est valide.
 */
import { session, type Certificate } from 'electron'
import type { CertInfo } from '@shared/types'

/** Clé = `<partition>|<hostname>`. En mémoire seulement — vidé à la fermeture. */
const certCache = new Map<string, CertInfo>()

function toCertInfo(cert: Certificate): CertInfo {
  return {
    subjectName: cert.subjectName,
    issuerName: cert.issuerName,
    validStart: cert.validStart,
    validExpiry: cert.validExpiry,
    fingerprint: cert.fingerprint
  }
}

const observed = new Set<string>()

/** Installe l'observateur sur une partition (idempotent). */
export function installCertificateObserver(partition: string): void {
  if (observed.has(partition)) return
  observed.add(partition)
  session.fromPartition(partition).setCertificateVerifyProc((request, callback) => {
    certCache.set(`${partition}|${request.hostname}`, toCertInfo(request.certificate))
    callback(-3) // -3 = utiliser la vérification par défaut de Chromium.
  })
}

export function getCertInfo(partition: string, hostname: string): CertInfo | null {
  return certCache.get(`${partition}|${hostname}`) ?? null
}
