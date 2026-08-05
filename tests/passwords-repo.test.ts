/**
 * Tests de `passwordsRepo` — base SQLite en mémoire réelle (comme
 * repositories.test.ts), mais `safeStorage` mocké (comme
 * settings-google.test.ts) puisque ce repo chiffre `password_enc` via
 * `../src/main/crypto.ts`. Couvre le roundtrip chiffré, la comparaison
 * create/update/unchanged, le scoping strict par origine et par profil, et
 * que `list()`/`suggestFor()` ne renvoient JAMAIS le mot de passe.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`enc(${s})`, 'utf8')),
  decryptString: vi.fn((buf: Buffer) => {
    const raw = buf.toString('utf8')
    const match = /^enc\((.*)\)$/.exec(raw)
    if (!match) throw new Error('clé illisible')
    return match[1]
  })
}))
vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

const { closeDatabase, openDatabase } = await import('../src/main/db/database')
const { passwordsRepo, profilesRepo } = await import('../src/main/db/repositories')

const PROFILE_A = 'profile-a'
const PROFILE_B = 'profile-b'

beforeEach(() => {
  openDatabase(':memory:')
  vi.clearAllMocks()
  safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
})

afterEach(() => {
  closeDatabase()
})

describe('passwordsRepo — roundtrip chiffré', () => {
  it('create puis list ne renvoie jamais le mot de passe', () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    const items = passwordsRepo.list(PROFILE_A)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(
      expect.objectContaining({ origin: 'https://example.com', identifier: 'user@example.com' })
    )
    expect(JSON.stringify(items[0])).not.toContain('hunter2')
  })

  it('get() déchiffre identifiant + mot de passe (autofill)', () => {
    const created = passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    const entry = passwordsRepo.get(PROFILE_A, created.id)
    expect(entry).toEqual({ identifier: 'user@example.com', password: 'hunter2' })
  })

  it('reveal() déchiffre uniquement le mot de passe', () => {
    const created = passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    expect(passwordsRepo.reveal(PROFILE_A, created.id)).toBe('hunter2')
  })

  it('update() change le mot de passe sans changer l’identifiant', () => {
    const created = passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'old')
    passwordsRepo.update(PROFILE_A, created.id, 'new')
    expect(passwordsRepo.reveal(PROFILE_A, created.id)).toBe('new')
    expect(passwordsRepo.get(PROFILE_A, created.id)?.identifier).toBe('user@example.com')
  })

  it('un échec de déchiffrement retourne null sans throw', () => {
    const created = passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    safeStorageMock.decryptString.mockImplementationOnce(() => {
      throw new Error('clé illisible')
    })
    let result: string | null = 'sentinel-not-reassigned'
    expect(() => {
      result = passwordsRepo.reveal(PROFILE_A, created.id)
    }).not.toThrow()
    expect(result).toBeNull()
  })
})

describe('passwordsRepo.matchExisting — décision create/update/ignore', () => {
  it("'new' si aucune entrée pour cette origine+identifiant", () => {
    expect(passwordsRepo.matchExisting(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')).toEqual({
      status: 'new'
    })
  })

  it("'new' si identifiant null (rien à comparer)", () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    expect(passwordsRepo.matchExisting(PROFILE_A, 'https://example.com', null, 'hunter2')).toEqual({ status: 'new' })
  })

  it("'unchanged' si le mot de passe soumis est identique au mot de passe enregistré", () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    const match = passwordsRepo.matchExisting(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    expect(match.status).toBe('unchanged')
  })

  it("'changed' si le mot de passe soumis diffère — propose une MISE À JOUR, pas un doublon", () => {
    const created = passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'old')
    const match = passwordsRepo.matchExisting(PROFILE_A, 'https://example.com', 'user@example.com', 'new')
    expect(match).toEqual({ status: 'changed', id: created.id })
  })
})

describe('passwordsRepo.suggestFor — scoping strict par origine exacte', () => {
  it('ne suggère jamais un identifiant d’une autre origine (même sous-domaine différent)', () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    passwordsRepo.create(PROFILE_A, 'https://login.example.com', 'user2@example.com', 'hunter3')
    expect(passwordsRepo.suggestFor(PROFILE_A, 'https://example.com')).toHaveLength(1)
    expect(passwordsRepo.suggestFor(PROFILE_A, 'https://login.example.com')).toHaveLength(1)
    expect(passwordsRepo.suggestFor(PROFILE_A, 'https://other.com')).toHaveLength(0)
  })

  it('ne renvoie jamais le mot de passe, seulement un identifiant masqué', () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'user@example.com', 'hunter2')
    const suggestions = passwordsRepo.suggestFor(PROFILE_A, 'https://example.com')
    expect(JSON.stringify(suggestions)).not.toContain('hunter2')
    expect(suggestions[0].identifierMasked).not.toBe('user@example.com')
  })
})

describe('passwordsRepo — isolation par profil', () => {
  it('list()/suggestFor() scopés au profil — jamais les entrées d’un autre profil', () => {
    passwordsRepo.create(PROFILE_A, 'https://example.com', 'a@example.com', 'pw-a')
    passwordsRepo.create(PROFILE_B, 'https://example.com', 'b@example.com', 'pw-b')
    expect(passwordsRepo.list(PROFILE_A).map((i) => i.identifier)).toEqual(['a@example.com'])
    expect(passwordsRepo.list(PROFILE_B).map((i) => i.identifier)).toEqual(['b@example.com'])
    expect(passwordsRepo.suggestFor(PROFILE_A, 'https://example.com')).toHaveLength(1)
  })

  it('remove()/clear() scopés au profil actif', () => {
    const a = passwordsRepo.create(PROFILE_A, 'https://example.com', 'a@example.com', 'pw-a')
    passwordsRepo.create(PROFILE_B, 'https://example.com', 'b@example.com', 'pw-b')
    passwordsRepo.remove(PROFILE_B, a.id) // mauvais profil — sans effet
    expect(passwordsRepo.list(PROFILE_A)).toHaveLength(1)
    passwordsRepo.clear(PROFILE_A)
    expect(passwordsRepo.list(PROFILE_A)).toHaveLength(0)
    expect(passwordsRepo.list(PROFILE_B)).toHaveLength(1)
  })

  it('profilesRepo.remove() efface aussi les mots de passe du profil (données sensibles)', () => {
    profilesRepo.create('A', 0, { icon: '✦', color: '#fff' })
    const [profile] = profilesRepo.list()
    passwordsRepo.create(profile.id, 'https://example.com', 'a@example.com', 'pw-a')
    expect(passwordsRepo.list(profile.id)).toHaveLength(1)
    profilesRepo.remove(profile.id)
    expect(passwordsRepo.list(profile.id)).toHaveLength(0)
  })
})
