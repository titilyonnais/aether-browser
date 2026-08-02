/**
 * Tests du système d'extensions (`src/main/extensions.ts`) : `electron`/`node:fs`
 * mockés (aucune vraie extraction, aucun vrai chargement de session). Couvre
 * trois corrections de cette session d'audit :
 * (1) `removeExtension`/`removeProfileExtensionFiles` libèrent enfin l'espace
 *     disque des extensions du Store (jamais un dossier d'extension non
 *     empaquetée, qui appartient à l'utilisateur, pas à nous) ;
 * (2) une icône de manifeste fabriquée (`../../../secret.png`) ne peut plus
 *     produire une `iconUrl` pointant hors du dossier de l'extension.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\Aether') },
  dialog: {},
  session: { fromPartition: vi.fn() }
}))
vi.mock('electron', () => electronMock)

vi.mock('adm-zip', () => ({ default: vi.fn() }))

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => {
    throw new Error('ENOENT')
  }),
  readFileSync: vi.fn(() => '{}'),
  rmSync: vi.fn(),
  statSync: vi.fn()
}))
vi.mock('node:fs', () => fsMock)

interface FakeExtensionRow {
  id: string
  extensionId: string | null
  name: string
  path: string
  enabled: boolean
  addedAt: number
}

const extensionsRepoMock = vi.hoisted(() => ({
  extensionsRepo: {
    listByProfile: vi.fn((): FakeExtensionRow[] => []),
    remove: vi.fn(),
    setName: vi.fn(),
    setEnabled: vi.fn(),
    setExtensionId: vi.fn(),
    add: vi.fn()
  }
}))
vi.mock('../src/main/db/repositories', () => extensionsRepoMock)
vi.mock('../src/main/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { removeExtension, removeProfileExtensionFiles, listExtensions } = await import('../src/main/extensions')

const WEBSTORE_ROOT = 'C:\\Users\\test\\AppData\\Roaming\\Aether\\extensions'

beforeEach(() => {
  vi.clearAllMocks()
  fsMock.readdirSync.mockImplementation(() => {
    throw new Error('ENOENT')
  })
  fsMock.readFileSync.mockReturnValue('{}')
  electronMock.session.fromPartition.mockReturnValue({
    extensions: {
      getAllExtensions: vi.fn(() => []),
      removeExtension: vi.fn()
    }
  })
})

describe('removeExtension — libère le disque uniquement pour une extension du Store', () => {
  it('supprime le dossier physique pour une extension installée depuis le Store', () => {
    const path = `${WEBSTORE_ROOT}\\profile-1\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
    extensionsRepoMock.extensionsRepo.listByProfile.mockReturnValue([
      { id: 'ext-1', extensionId: null, name: 'Test', path, enabled: true, addedAt: 0 }
    ])

    removeExtension('profile-1', 'persist:aether-web-profile-1', 'ext-1')

    expect(fsMock.rmSync).toHaveBeenCalledWith(path, { recursive: true, force: true })
    expect(extensionsRepoMock.extensionsRepo.remove).toHaveBeenCalledWith('ext-1')
  })

  it('NE supprime PAS un dossier d’extension non empaquetée (choisi par l’utilisateur, pas le nôtre)', () => {
    const path = 'C:\\Users\\test\\Documents\\mon-extension-dev'
    extensionsRepoMock.extensionsRepo.listByProfile.mockReturnValue([
      { id: 'ext-2', extensionId: null, name: 'Dev', path, enabled: true, addedAt: 0 }
    ])

    removeExtension('profile-1', 'persist:aether-web-profile-1', 'ext-2')

    expect(fsMock.rmSync).not.toHaveBeenCalled()
    expect(extensionsRepoMock.extensionsRepo.remove).toHaveBeenCalledWith('ext-2')
  })
})

describe('removeProfileExtensionFiles — nettoyage à la disparition d’un profil', () => {
  it('supprime les dossiers du Store de ce profil, ignore les extensions non empaquetées', () => {
    const webstorePath = `${WEBSTORE_ROOT}\\profile-1\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
    const localPath = 'C:\\Users\\test\\Documents\\mon-extension-dev'
    extensionsRepoMock.extensionsRepo.listByProfile.mockReturnValue([
      { id: 'ext-1', extensionId: null, name: 'Store', path: webstorePath, enabled: true, addedAt: 0 },
      { id: 'ext-2', extensionId: null, name: 'Dev', path: localPath, enabled: true, addedAt: 0 }
    ])

    removeProfileExtensionFiles('profile-1')

    expect(fsMock.rmSync).toHaveBeenCalledTimes(1)
    expect(fsMock.rmSync).toHaveBeenCalledWith(webstorePath, { recursive: true, force: true })
  })
})

describe('listExtensions — traversée de chemin sur l’icône de manifeste', () => {
  it('rejette une icône fabriquée pour ressortir du dossier de l’extension', () => {
    const path = 'C:\\Users\\test\\Documents\\mon-extension-dev'
    extensionsRepoMock.extensionsRepo.listByProfile.mockReturnValue([
      { id: 'ext-1', extensionId: null, name: 'Test', path, enabled: true, addedAt: 0 }
    ])
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ icons: { '128': '../../../../secret.png' } }))

    const [info] = listExtensions('profile-1', 'persist:aether-web-profile-1')

    expect(info.iconUrl).toBeNull()
  })

  it('accepte une icône légitime, relative au dossier de l’extension', () => {
    const path = 'C:\\Users\\test\\Documents\\mon-extension-dev'
    extensionsRepoMock.extensionsRepo.listByProfile.mockReturnValue([
      { id: 'ext-1', extensionId: null, name: 'Test', path, enabled: true, addedAt: 0 }
    ])
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ icons: { '128': 'icons/128.png' } }))

    const [info] = listExtensions('profile-1', 'persist:aether-web-profile-1')

    expect(info.iconUrl).toMatch(/^file:\/\/\//)
    expect(info.iconUrl).toContain('128.png')
  })
})
