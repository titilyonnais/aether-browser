/**
 * Candidature navigateur par défaut — vérifie (1) qu'AUCUNE écriture
 * registre n'a lieu en build portable, qui promet explicitement de n'en
 * jamais faire (electron-builder.yml), (2) que l'enregistrement écrit bien
 * la structure `StartMenuInternet`/`Capabilities`/`RegisteredApplications`
 * que Windows lit pour peupler son sélecteur (et non plus l'ancien
 * `app.setAsDefaultProtocolClient`, insuffisant — ÆTHER n'apparaissait pas
 * dans Windows Paramètres > Applications par défaut malgré cet appel), et
 * (3) que le statut « par défaut » reflète `UserChoice`, le seul signal que
 * l'utilisateur — pas ÆTHER lui-même — peut écrire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  app: {
    getPath: vi.fn((name: string) =>
      name === 'exe' ? 'C:\\Program Files\\Aether\\Aether.exe' : 'C:\\Users\\test\\AppData\\Local\\Temp'
    )
  },
  shell: { openExternal: vi.fn() }
}))
vi.mock('electron', () => electronMock)

const childProcessMock = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock('node:child_process', () => childProcessMock)

const fsMock = vi.hoisted(() => ({ writeFileSync: vi.fn(), unlinkSync: vi.fn() }))
vi.mock('node:fs', () => fsMock)

const ORIGINAL_ENV = process.env.PORTABLE_EXECUTABLE_DIR

async function freshModule() {
  vi.resetModules()
  return import('../src/main/defaultBrowser')
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.PORTABLE_EXECUTABLE_DIR
})

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR
  else process.env.PORTABLE_EXECUTABLE_DIR = ORIGINAL_ENV
})

describe('build portable — aucune écriture registre', () => {
  it('isPortableBuild détecte PORTABLE_EXECUTABLE_DIR', async () => {
    const mod = await freshModule()
    expect(mod.isPortableBuild()).toBe(false)
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\Users\\test\\Desktop'
    expect(mod.isPortableBuild()).toBe(true)
  })

  it("registerAsDefaultBrowserCandidate n'écrit RIEN en portable", async () => {
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\Users\\test\\Desktop'
    const mod = await freshModule()
    mod.registerAsDefaultBrowserCandidate()
    expect(fsMock.writeFileSync).not.toHaveBeenCalled()
    expect(childProcessMock.execFileSync).not.toHaveBeenCalled()
  })

  it('getDefaultBrowserState signale available:false en portable, sans même interroger le registre', async () => {
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\Users\\test\\Desktop'
    const mod = await freshModule()
    expect(mod.getDefaultBrowserState()).toEqual({ isDefault: false, available: false })
    expect(childProcessMock.execFileSync).not.toHaveBeenCalled()
  })
})

describe('registerAsDefaultBrowserCandidate — structure registre réelle', () => {
  it('importe un .reg contenant StartMenuInternet, Capabilities et RegisteredApplications', async () => {
    const mod = await freshModule()
    mod.registerAsDefaultBrowserCandidate()

    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1)
    const [tmpPath, buffer] = fsMock.writeFileSync.mock.calls[0]
    expect(String(tmpPath)).toMatch(/\.reg$/)

    // BOM UTF-16LE (FF FE) : sans lui, reg.exe corrompt les caractères
    // accentués (Æ, é, à…) du script importé.
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
    const script = buffer.subarray(2).toString('utf16le')

    // Le signal que le sélecteur Windows lit réellement pour lister ÆTHER
    // comme navigateur candidat — pas l'ancien mécanisme pré-Windows 8.
    expect(script).toContain('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\Aether]')
    expect(script).toContain('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\Aether\\Capabilities]')
    expect(script).toContain(
      '[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\Aether\\Capabilities\\URLAssociations]'
    )
    expect(script).toContain('"http"="AetherHTML"')
    expect(script).toContain('"https"="AetherHTML"')
    expect(script).toContain('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]')
    expect(script).toContain('"Aether"="Software\\\\Clients\\\\StartMenuInternet\\\\Aether\\\\Capabilities"')
    // Chemin de l'exe correctement échappé (backslashes doublés) dans les
    // commandes d'ouverture.
    expect(script).toContain('C:\\\\Program Files\\\\Aether\\\\Aether.exe')

    expect(childProcessMock.execFileSync).toHaveBeenCalledWith(
      'reg',
      ['import', tmpPath],
      expect.objectContaining({ windowsHide: true })
    )
    // Le fichier temporaire est nettoyé après l'import, réussi ou non.
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(tmpPath)
  })

  it("un échec de l'import (permissions, antivirus…) ne remonte jamais — et nettoie quand même", async () => {
    childProcessMock.execFileSync.mockImplementation(() => {
      throw new Error('Accès refusé')
    })
    const mod = await freshModule()
    expect(() => mod.registerAsDefaultBrowserCandidate()).not.toThrow()
    expect(fsMock.unlinkSync).toHaveBeenCalled()
  })
})

describe('isDefaultBrowser — reflète UserChoice, jamais un signal qu\'ÆTHER a écrit lui-même', () => {
  it('true seulement si http ET https pointent vers AetherHTML', async () => {
    childProcessMock.execFileSync.mockReturnValue(
      '    ProgId    REG_SZ    AetherHTML\r\n'
    )
    const mod = await freshModule()
    expect(mod.getDefaultBrowserState()).toEqual({ isDefault: true, available: true })
  })

  it('false si un seul des deux protocoles ne correspond pas', async () => {
    childProcessMock.execFileSync
      .mockReturnValueOnce('    ProgId    REG_SZ    AetherHTML\r\n')
      .mockReturnValueOnce('    ProgId    REG_SZ    ChromeHTML\r\n')
    const mod = await freshModule()
    expect(mod.isDefaultBrowser()).toBe(false)
  })

  it("false si la clé UserChoice n'existe pas encore (jamais choisi)", async () => {
    childProcessMock.execFileSync.mockImplementation(() => {
      throw new Error('Le système ne trouve pas le chemin d’accès spécifié')
    })
    const mod = await freshModule()
    expect(mod.isDefaultBrowser()).toBe(false)
  })
})

describe('promptSetDefaultBrowser', () => {
  it('ouvre la page Windows dédiée, jamais un lien arbitraire', async () => {
    const mod = await freshModule()
    mod.promptSetDefaultBrowser()
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith('ms-settings:defaultapps')
  })
})
