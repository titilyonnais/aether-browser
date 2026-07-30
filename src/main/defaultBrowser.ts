/**
 * Candidature d'ÆTHER comme navigateur par défaut de Windows.
 *
 * Windows bloque volontairement, depuis Windows 8, toute application qui
 * essaierait de SE DÉSIGNER elle-même par défaut sans confirmation explicite
 * de l'utilisateur (protection contre le détournement de navigateur). Le
 * parcours réellement fonctionnel — celui qu'utilisent Chrome, Firefox,
 * Brave, Edge — se fait donc en deux temps bien distincts :
 *
 *  1. S'ENREGISTRER comme candidat valide. `app.setAsDefaultProtocolClient`
 *     pour `http`/`https`, sous Windows, ne se contente pas de poser un
 *     gestionnaire de protocole ordinaire : Electron reprend ici le même
 *     mécanisme que Chromium pour un VRAI navigateur (clé
 *     `Software\Clients\StartMenuInternet\<AppUserModelId>`, ses
 *     `Capabilities\URLAssociations` pour http/https, et l'inscription sous
 *     `RegisteredApplications`). C'est CE enregistrement qui fait apparaître
 *     ÆTHER dans le sélecteur Windows — le signal que l'utilisateur demande.
 *  2. LAISSER L'UTILISATEUR CONFIRMER. Aucune API ne permet de devenir
 *     défaut silencieusement ; on ouvre la page Windows dédiée
 *     (`ms-settings:defaultapps`), où ÆTHER apparaît désormais comme un choix
 *     possible grâce à l'étape 1.
 *
 * Ré-enregistré à CHAQUE lancement (étape 1) : opération idempotente et bon
 * marché (quelques écritures registre), qui rattrape un enregistrement
 * corrompu ou effacé par une réinstallation sans qu'on ait à y penser.
 */
import { app, shell } from 'electron'

/**
 * Vrai pour le build « portable » (electron-builder.yml : un seul .exe
 * autonome lancé depuis n'importe où — clé USB comprise — qui promet
 * EXPLICITEMENT « aucune écriture registre »). `PORTABLE_EXECUTABLE_DIR` est
 * la variable d'environnement que le lanceur portable d'electron-builder pose
 * lui-même avant d'exécuter l'binaire réel — c'est le repère officiel pour la
 * détecter à l'exécution, sans avoir à faire suivre l'information autrement.
 *
 * Devenir navigateur par défaut EXIGE des écritures registre par nature
 * (c'est littéralement ce que Windows y inscrit) : ce chantier entier reste
 * donc désactivé pour ce build, promesse tenue plutôt que candidature au
 * rabais.
 */
export function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}

/** Enregistre ÆTHER comme gestionnaire candidat de http/https — sans effet
 * sur le choix RÉEL de l'utilisateur (voir le commentaire d'en-tête). */
export function registerAsDefaultBrowserCandidate(): void {
  if (isPortableBuild()) return
  try {
    app.setAsDefaultProtocolClient('http')
    app.setAsDefaultProtocolClient('https')
  } catch {
    // Écriture registre refusée (permissions, antivirus…) — sans conséquence
    // bloquante : la bannière proposera simplement de réessayer plus tard,
    // `isDefaultBrowser()` continuera de refléter l'état réel du système.
  }
}

/** ÆTHER est-il ACTUELLEMENT le navigateur par défaut ? Les deux protocoles
 * sont vérifiés : Windows peut désolidariser http et https (rare, mais un
 * système propre les traite toujours ensemble). Toujours `false` en portable
 * — ÆTHER n'y est jamais enregistré, voir `isPortableBuild`. */
export function isDefaultBrowser(): boolean {
  if (isPortableBuild()) return false
  try {
    return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https')
  } catch {
    return false
  }
}

/** État complet exposé au renderer — `available: false` masque la bannière
 * entièrement plutôt que de proposer un bouton menant à une impasse (ÆTHER
 * n'apparaîtrait de toute façon pas dans le sélecteur Windows en portable). */
export function getDefaultBrowserState(): { isDefault: boolean; available: boolean } {
  return { isDefault: isDefaultBrowser(), available: !isPortableBuild() }
}

/** Ouvre la page Windows où l'utilisateur peut RÉELLEMENT confirmer le
 * changement — la seule étape qu'aucune API ne permet d'automatiser. */
export function promptSetDefaultBrowser(): void {
  void shell.openExternal('ms-settings:defaultapps')
}
