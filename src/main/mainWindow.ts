/**
 * Fenêtre principale — frameless, fond très sombre, coins arrondis Windows 11.
 * Le renderer dessine sa propre barre de titre (zones -webkit-app-region).
 */
import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Icône de fenêtre (surtout utile en dev ; en prod l'exe porte déjà l'icône). */
function windowIcon(): string | undefined {
  const candidate = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#060608',
    title: 'ÆTHER',
    icon: windowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Le shell UI n'ouvre jamais de fenêtres ; tout lien externe part vers l'OS.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // DevTools de l'interface en développement uniquement.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12' && input.shift) {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
