/**
 * Fenêtre principale — frameless, fond très sombre, coins arrondis Windows 11.
 * Le renderer dessine sa propre barre de titre (zones -webkit-app-region).
 */
import { app, BrowserWindow, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getWindowState, setWindowState } from './settings'

/** Icône de fenêtre (surtout utile en dev ; en prod l'exe porte déjà l'icône). */
function windowIcon(): string | undefined {
  const candidate = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}

/** Le coin haut-gauche mémorisé doit retomber sur un écran encore connecté
 * (moniteur externe débranché depuis…) — sinon Electron peut ouvrir la
 * fenêtre hors champ, invisible. `null` fait retomber sur le centrage par
 * défaut d'Electron plutôt que d'imposer une position invalide. */
function validBounds(bounds: { x: number; y: number; width: number; height: number }): typeof bounds | null {
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return bounds.x >= a.x - 50 && bounds.y >= a.y - 50 && bounds.x < a.x + a.width && bounds.y < a.y + a.height
  })
  return onScreen ? bounds : null
}

export function createMainWindow(): BrowserWindow {
  const savedState = getWindowState()
  const savedBounds = savedState ? validBounds(savedState.bounds) : null

  const win = new BrowserWindow({
    width: savedBounds?.width ?? 1480,
    height: savedBounds?.height ?? 920,
    x: savedBounds?.x,
    y: savedBounds?.y,
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

  // Réapplique l'agrandissement/plein écran d'AVANT le show() — sinon un
  // passage bref par la taille non-agrandie serait visible au lancement.
  win.once('ready-to-show', () => {
    if (savedState?.isMaximized) win.maximize()
    if (savedState?.isFullScreen) win.setFullScreen(true)
    win.show()
  })

  win.on('close', () => {
    if (win.isDestroyed()) return
    setWindowState({
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
      bounds: win.getNormalBounds()
    })
  })

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
