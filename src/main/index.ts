/**
 * Point d'entrée du processus principal d'ÆTHER.
 * Sécurité : sandbox global, contextIsolation partout, webview interdit,
 * permissions web réduites au strict minimum.
 */
import { app, Menu, session, type BrowserWindow } from 'electron'
import { AiRouter } from './ai/router'
import { closeDatabase, openDatabase } from './db/database'
import { profilesRepo } from './db/repositories'
import { applyFlagsBeforeReady } from './flags'
import { createViewDelegate, ensureBootstrap, registerIpc } from './ipc'
import { createMainWindow } from './mainWindow'
import { installAetherProtocol, registerAetherScheme } from './protocol'
import { checkForUpdates, initUpdater } from './updater'
import { ViewManager } from './viewManager'

// Drapeaux expérimentaux : les switches doivent être posés AVANT tout le reste.
applyFlagsBeforeReady()

// Sandbox pour tous les renderers, sans exception.
app.enableSandbox()
registerAetherScheme()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Aucun <webview> ne doit jamais s'attacher, d'où qu'il vienne.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.aether.browser')
    Menu.setApplicationMenu(null)

    openDatabase()
    const { activeProfileId } = ensureBootstrap()
    installAetherProtocol()

    // La session UI (defaultSession) n'a besoin d'aucune permission web.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

    mainWindow = createMainWindow()

    const router = new AiRouter()
    let views: ViewManager | null = null
    const delegate = createViewDelegate(mainWindow, () => views as ViewManager, router)
    views = new ViewManager(mainWindow, delegate)
    // Les nouvelles vues naîtront dans la partition (session isolée) du profil actif.
    views.setActiveProfile(activeProfileId, profilesRepo.get(activeProfileId)?.isPrivate ?? false)

    registerIpc({ win: mainWindow, views, router })

    // Sonde IA en arrière-plan (Ollama local, clés configurées).
    void router.refreshStatus()

    // Vérification silencieuse au lancement, comme Chrome — un délai laisse
    // la fenêtre finir de s'afficher avant ce travail de fond.
    initUpdater(mainWindow)
    setTimeout(() => checkForUpdates(), 4000)

    mainWindow.on('closed', () => {
      views?.closeAll()
      mainWindow = null
    })
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    // Filet de sécurité si l'appli quitte pendant qu'un profil de navigation
    // privée est encore actif (sans passage par un changement de profil,
    // seul chemin normalement couvert dans `switchToProfile`, main/ipc.ts).
    for (const profile of profilesRepo.list()) {
      if (profile.isPrivate) profilesRepo.remove(profile.id)
    }
    closeDatabase()
  })
}
