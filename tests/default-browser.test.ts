/**
 * Candidature navigateur par défaut — vérifie surtout la garantie la plus
 * importante : AUCUNE écriture registre en build portable, qui promet
 * explicitement de n'en jamais faire (electron-builder.yml).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  app: {
    setAsDefaultProtocolClient: vi.fn(),
    isDefaultProtocolClient: vi.fn(() => true)
  },
  shell: { openExternal: vi.fn() }
}))
vi.mock('electron', () => electronMock)

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
    expect(electronMock.app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('registerAsDefaultBrowserCandidate écrit normalement hors portable', async () => {
    const mod = await freshModule()
    mod.registerAsDefaultBrowserCandidate()
    expect(electronMock.app.setAsDefaultProtocolClient).toHaveBeenCalledWith('http')
    expect(electronMock.app.setAsDefaultProtocolClient).toHaveBeenCalledWith('https')
  })

  it('getDefaultBrowserState signale available:false en portable, sans même interroger isDefaultProtocolClient', async () => {
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\Users\\test\\Desktop'
    const mod = await freshModule()
    expect(mod.getDefaultBrowserState()).toEqual({ isDefault: false, available: false })
    expect(electronMock.app.isDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('getDefaultBrowserState reflète le statut réel hors portable', async () => {
    electronMock.app.isDefaultProtocolClient.mockReturnValue(true)
    const mod = await freshModule()
    expect(mod.getDefaultBrowserState()).toEqual({ isDefault: true, available: true })
  })
})

describe('promptSetDefaultBrowser', () => {
  it('ouvre la page Windows dédiée, jamais un lien arbitraire', async () => {
    const mod = await freshModule()
    mod.promptSetDefaultBrowser()
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith('ms-settings:defaultapps')
  })
})
