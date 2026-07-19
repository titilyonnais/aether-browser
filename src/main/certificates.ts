/**
 * Observation des certificats TLS — jamais de décision de confiance ici.
 *
 * `session.setCertificateVerifyProc` REMPLACE la vérification par défaut si on
 * la laisse faire ; on l'utilise uniquement pour CAPTURER les détails du
 * certificat de chaque hôte visité, puis on rend systématiquement `-3` pour
 * déléguer la décision réelle au vérificateur Chromium intégré. ÆTHER ne
 * décide jamais elle-même si un certificat est valide.
 */
import { X509Certificate, createHash } from 'node:crypto'
import { session, type Certificate } from 'electron'
import type { CertificateChainLink, CertificateDetail } from '@shared/types'

/** Clé = `<partition>|<hostname>`. En mémoire seulement — vidé à la fermeture.
 * Le `Certificate` BRUT est gardé tel quel (juste une référence, coût
 * négligeable) pour permettre de calculer `CertificateDetail` PARESSEUSEMENT
 * (parsing X.509 + 2 empreintes SHA-256 + parcours de chaîne) seulement si
 * l'utilisateur ouvre réellement l'onglet certificat — inutile de le faire
 * pour CHAQUE sous-ressource/CDN chargée par CHAQUE page. */
const rawCertCache = new Map<string, Certificate>()

const observed = new Set<string>()

/** Installe l'observateur sur une partition (idempotent). */
export function installCertificateObserver(partition: string): void {
  if (observed.has(partition)) return
  observed.add(partition)
  session.fromPartition(partition).setCertificateVerifyProc((request, callback) => {
    rawCertCache.set(`${partition}|${request.hostname}`, request.certificate)
    callback(-3) // -3 = utiliser la vérification par défaut de Chromium.
  })
}

/** SHA-256 de la clé publique (technique SPKI — même méthode que Chrome :
 * `openssl x509 -pubkey | openssl pkey -pubin -outform der | openssl dgst -sha256`). */
function publicKeyFingerprint(x509: X509Certificate): string {
  return createHash('sha256').update(x509.publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
}

function principalOf(x509: X509Certificate, which: 'subject' | 'issuer'): { commonName: string; organization?: string } {
  // `x509.subject`/`.issuer` de Node : chaîne multi-lignes façon
  // `CN=exemple.com\nO=Exemple Inc`, pas un objet structuré — extraction simple
  // par préfixe de ligne (suffisant pour CN/O, les seuls champs affichés).
  const raw = x509[which]
  const lines = raw.split('\n')
  const get = (prefix: string): string | undefined => lines.find((l) => l.startsWith(prefix))?.slice(prefix.length)
  return { commonName: get('CN=') ?? raw, organization: get('O=') }
}

/** Parcourt la chaîne (`issuerCert`) jusqu'à la racine — Electron documente
 * `issuerCert` comme absent "si auto-signé" mais le TYPE le déclare non
 * optionnel (ambiguïté non résolue côté doc Electron) : on ne se fie donc PAS
 * à un simple test de nullité pour détecter la racine, mais à l'ÉGALITÉ
 * d'empreinte avec son propre émetteur — plus une limite de profondeur fixe
 * en garde-fou indépendant contre toute donnée cyclique/malformée inattendue. */
function walkChain(cert: Certificate): CertificateChainLink[] {
  const links: CertificateChainLink[] = []
  let current: Certificate | undefined = cert
  let depth = 0
  try {
    while (current && depth < 10) {
      const x509 = new X509Certificate(current.data)
      const { commonName, organization } = principalOf(x509, 'subject')
      const isSelfSigned = current.fingerprint === current.issuerCert?.fingerprint
      links.push({ commonName, organization, isSelfSigned })
      if (isSelfSigned) break
      current = current.issuerCert
      depth++
    }
  } catch {
    // Chaîne partiellement inhabituelle/inattendue — on affiche ce qui a déjà
    // été collecté plutôt que de faire échouer tout l'onglet Détails.
  }
  return links
}

/** Calcule le détail complet — voir le commentaire sur `rawCertCache` pour
 * pourquoi ce n'est PAS fait à chaque poignée de main. Le parsing X509 de
 * Node est de l'ordre de la milliseconde, largement acceptable en synchrone
 * au moment du clic utilisateur (`CH.siteCertificateDetail`). */
export function getCertificateDetail(partition: string, hostname: string): CertificateDetail | null {
  const cert = rawCertCache.get(`${partition}|${hostname}`)
  if (!cert) return null
  try {
    const x509 = new X509Certificate(cert.data)
    return {
      subject: principalOf(x509, 'subject'),
      issuer: principalOf(x509, 'issuer'),
      serialNumber: x509.serialNumber,
      validStart: cert.validStart,
      validExpiry: cert.validExpiry,
      fingerprint: x509.fingerprint256,
      publicKeyFingerprint: publicKeyFingerprint(x509),
      // `undefined` si l'algorithme n'est pas reconnu par nom plutôt que
      // d'inventer une valeur — voir la doc du champ dans shared/types.ts.
      signatureAlgorithm: x509.signatureAlgorithm,
      chain: walkChain(cert),
      pem: cert.data
    }
  } catch {
    return null
  }
}
