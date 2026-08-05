/**
 * Chiffrement générique au repos (DPAPI via `safeStorage`, repli brut si
 * indisponible) — module dédié, séparé de `settings.ts`, pour que
 * `db/repositories.ts` (qui chiffre `passwords.password_enc`) puisse
 * l'importer sans créer de dépendance circulaire (`settings.ts` importe déjà
 * `kvRepo` depuis `db/repositories.ts`).
 */
import { safeStorage } from 'electron'

export function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64')
  }
  // Repli très rare (DPAPI indisponible) — stockage brut signalé par préfixe.
  return 'raw:' + Buffer.from(value, 'utf8').toString('base64')
}

export function decryptValue(stored: string): string | null {
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('raw:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf8')
    }
  } catch {
    // Clé illisible (profil changé…) → considérée absente.
  }
  return null
}
