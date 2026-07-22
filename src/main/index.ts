/**
 * Point d'entrée du processus principal d'ÆTHER.
 * Sécurité : sandbox global, contextIsolation partout, webview interdit,
 * permissions web réduites au strict minimum.
 */
import { app, Menu, session, type BrowserWindow } from 'electron'
import { AiRouter } from './ai/router'
import { closeDatabase, openDatabase } from './db/database'
import { embeddingsRepo, profilesRepo } from './db/repositories'
import { applyFlagsBeforeReady } from './flags'
import { attachWindowLifecycleEvents, createViewDelegate, ensureBootstrap, registerIpc } from './ipc'
import { createMainWindow } from './mainWindow'
import { cleanupPreviews } from './previews'
import { installAetherProtocol, registerAetherScheme } from './protocol'
import { isQuitting } from './quitState'
import { getSettings, seedE2eDefaultsFromEnv, seedSmtpConfigFromEnv } from './settings'
import { checkForUpdates, initUpdater } from './updater'
import { ViewManager } from './viewManager'
import { allWindowContexts, registerWindowContext } from './windowRegistry'

// Filet de sécurité pour une classe d'erreur bien identifiée : un canal IPC
// « one-way » (`ipcMain.on`, fire-and-forget — contrairement à `.handle()`,
// dont les erreurs sont rattrapées et renvoyées côté renderer sous forme de
// promesse rejetée) qui touche encore la base juste après sa fermeture
// (`will-quit` ci-dessous) ferait planter tout le process avec le dialogue
// d'erreur Electron, alors que l'appli est de toute façon en train de quitter
// — perdre cette toute dernière écriture est sans conséquence réelle. Le
// principal déclencheur connu (l'anti-rebond de sauvegarde du Focus,
// actions.ts) annule déjà ses propres timers à la fermeture ; ce filet ne
// couvre que ce message d'erreur PRÉCIS, pas les erreurs inattendues.
process.on('uncaughtException', (err) => {
  if (err.message === 'Base de données non initialisée') return
  throw err
})

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
    seedSmtpConfigFromEnv()
    seedE2eDefaultsFromEnv()
    // Filet de sécurité si un crash/kill forcé a empêché le nettoyage normal
    // de `will-quit` (ci-dessous) : un profil de navigation privée resté en
    // base survivrait sinon indéfiniment (espaces/pages/visites/favoris),
    // et réapparaîtrait dans le sélecteur de profils au lancement suivant —
    // AVANT `ensureBootstrap()` pour qu'un profil actif pointant vers l'un
    // d'eux retombe proprement sur un profil normal.
    for (const profile of profilesRepo.list()) {
      if (profile.isPrivate) profilesRepo.remove(profile.id)
    }
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
    // Registre multi-fenêtre (windowRegistry.ts) : `ipc.ts` résout désormais
    // le contexte {win, views} par évènement via `resolveWindowContext`,
    // plutôt que de fermer sur cette unique fenêtre.
    registerWindowContext({ win: mainWindow, views })
    attachWindowLifecycleEvents(mainWindow)

    registerIpc(router)

    // Sonde IA en arrière-plan (Ollama local, clés configurées).
    void router.refreshStatus()

    // Vérification silencieuse au lancement, comme Chrome — un délai laisse
    // la fenêtre finir de s'afficher avant ce travail de fond. Réglable
    // (Réglages › À propos) : la vérification MANUELLE, elle, marche toujours.
    initUpdater(mainWindow)
    if (getSettings().autoCheckForUpdates) setTimeout(() => checkForUpdates(), 4000)

    // Ménage des aperçus JPEG en arrière-plan : orphelins (page supprimée sans
    // passer par `deletePreview` — suppression d'un espace/profil entier,
    // crash) + éviction des plus anciens si le dossier dépasse la limite de
    // taille/nombre. Différé et fire-and-forget, comme la vérif de mise à
    // jour ci-dessus — travail d'I/O pur, aucune UI n'en dépend.
    setTimeout(() => void cleanupPreviews(), 6000)

    // Filet de sécurité (démarrage) : embeddings dont la page/note n'existe
    // plus (base migrée depuis avant le nettoyage proactif ajouté dans
    // spacesRepo/profilesRepo/pagesRepo, ou coupure en plein milieu d'une
    // suppression) — requête SQLite synchrone mais légère (une table dédiée,
    // pas de parcours filesystem), pas besoin de la différer autant que les
    // aperçus JPEG.
    setTimeout(() => embeddingsRepo.removeOrphans(), 3000)

    // Réglage « minimiser au lieu de fermer » — n'intercepte QUE le bouton X/
    // Alt+F4 (pas un vrai « Quitter ÆTHER », qui marque `isQuitting()` avant
    // d'appeler `app.quit()`, cf. CH.appQuit dans ipc.ts). Uniquement si c'est
    // la DERNIÈRE fenêtre ÆTHER encore ouverte — sinon fermer celle-ci doit
    // juste la fermer, comme n'importe quelle fenêtre secondaire.
    mainWindow.on('close', (event) => {
      if (!isQuitting() && getSettings().minimizeOnClose && allWindowContexts().length <= 1) {
        event.preventDefault()
        mainWindow?.minimize()
      }
    })

    mainWindow.on('closed', () => {
      views?.closeAll()
      mainWindow = null
    })
  })

  app.on('window-all-closed', () => app.quit())
  // `will-quit` (PAS `before-quit`) : ce dernier se déclenche AVANT la fermeture
  // des fenêtres, donc avant leurs handlers `close` (minimizeOnClose ci-dessus,
  // sauvegarde de l'état fenêtre dans mainWindow.ts) — qui ont encore besoin de
  // la base de données. La fermer ici plutôt qu'en `before-quit` évitait un
  // crash « Base de données non initialisée » quand ces handlers s'exécutaient
  // après coup.
  app.on('will-quit', () => {
    // Filet de sécurité si l'appli quitte pendant qu'un profil de navigation
    // privée est encore actif (sans passage par un changement de profil,
    // seul chemin normalement couvert dans `switchToProfile`, main/ipc.ts).
    for (const profile of profilesRepo.list()) {
      if (profile.isPrivate) profilesRepo.remove(profile.id)
    }
    closeDatabase()
  })
}
