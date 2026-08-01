/**
 * `avatarImageDataUrl`/`deleteAvatarImage` opèrent sur un fichier du dossier
 * `userData/avatars/` à partir d'un `filename` reçu tel quel de l'IPC
 * (`newtab:background-image-data-url`, `profileCreate`, `profileSetAvatarImage`,
 * `profileClearAvatar`, `profileRemove`), sans schéma Zod côté appelant.
 * Régression : seule l'EXTENSION était vérifiée avant cette correction —
 * un `filename` du type `../../../ailleurs/secret.png` passait ce contrôle
 * et `join(avatarsDir(), filename)` ressortait alors du dossier prévu, en
 * LECTURE comme en SUPPRESSION (cette dernière bien plus grave : `unlinkSync`
 * est destructif et irréversible).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\Aether') }
}))
vi.mock('electron', () => electronMock)

const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn(() => Buffer.from('fake-image-bytes')),
  unlinkSync: vi.fn()
}))
vi.mock('node:fs', () => fsMock)

const { avatarImageDataUrl, deleteAvatarImage } = await import('../src/main/avatars')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('avatarImageDataUrl', () => {
  it('relit un fichier légitime (nom UUID généré par chooseAndSaveAvatarImage)', () => {
    const filename = '3fa2c9b0-1234-4abc-9def-abcdef012345.png'
    const dataUrl = avatarImageDataUrl(filename)
    expect(dataUrl).toBe(`data:image/png;base64,${Buffer.from('fake-image-bytes').toString('base64')}`)
    expect(fsMock.readFileSync).toHaveBeenCalledTimes(1)
  })

  it('rejette une tentative de traversée de chemin SANS toucher au disque', () => {
    const dataUrl = avatarImageDataUrl('../../../../Windows/win.ini.png')
    expect(dataUrl).toBeNull()
    expect(fsMock.readFileSync).not.toHaveBeenCalled()
  })

  it('rejette un nom qui ne respecte pas le format UUID attendu', () => {
    expect(avatarImageDataUrl('not-a-real-avatar-name.png')).toBeNull()
    expect(fsMock.readFileSync).not.toHaveBeenCalled()
  })

  it('rejette toujours une extension non autorisée', () => {
    expect(avatarImageDataUrl('3fa2c9b0-1234-4abc-9def-abcdef012345.exe')).toBeNull()
    expect(fsMock.readFileSync).not.toHaveBeenCalled()
  })
})

describe('deleteAvatarImage', () => {
  it('supprime un fichier légitime (nom UUID généré par chooseAndSaveAvatarImage)', () => {
    deleteAvatarImage('3fa2c9b0-1234-4abc-9def-abcdef012345.png')
    expect(fsMock.unlinkSync).toHaveBeenCalledTimes(1)
  })

  it('rejette une tentative de traversée de chemin SANS toucher au disque', () => {
    deleteAvatarImage('../../../../Users/victime/Documents/important.docx.png')
    expect(fsMock.unlinkSync).not.toHaveBeenCalled()
  })

  it('rejette un nom qui ne respecte pas le format UUID attendu', () => {
    deleteAvatarImage('not-a-real-avatar-name.png')
    expect(fsMock.unlinkSync).not.toHaveBeenCalled()
  })
})
