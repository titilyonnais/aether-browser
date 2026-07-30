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
 *     a été essayé en premier lieu, mais sous Windows il ne fait qu'écrire
 *     `HKCU\Software\Classes\http\shell\open\command` — le mécanisme
 *     PRÉ-Windows 8, que le sélecteur « Applications par défaut » de
 *     Windows 10/11 ignore totalement pour les navigateurs (confirmé : test
 *     utilisateur, ÆTHER absent de la liste malgré cet appel). Ce que
 *     Windows lit RÉELLEMENT pour peupler cette liste, c'est la structure
 *     `Software\Clients\StartMenuInternet\<Nom>` + sa sous-clé
 *     `Capabilities` (URLAssociations, FileAssociations), inscrite sous
 *     `Software\RegisteredApplications` — la même que Chrome/Brave/Firefox.
 *     Electron n'expose aucune API pour ça : on écrit ces clés nous-mêmes,
 *     via un fichier `.reg` temporaire importé par `reg.exe` (UN SEUL
 *     process pour tout le lot, plutôt que quinze appels FFI/registre
 *     séparés — bon marché même répété à chaque lancement).
 *  2. LAISSER L'UTILISATEUR CONFIRMER. Aucune API ne permet de devenir
 *     défaut silencieusement ; on ouvre la page Windows dédiée
 *     (`ms-settings:defaultapps`), où ÆTHER apparaît désormais comme un choix
 *     possible grâce à l'étape 1.
 *
 * Ré-enregistré à CHAQUE lancement (étape 1) : opération idempotente et bon
 * marché (un seul import registre), qui rattrape un enregistrement corrompu
 * ou effacé par une réinstallation sans qu'on ait à y penser.
 */
import { app, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Nom de la clé `StartMenuInternet` ET de l'entrée `RegisteredApplications`. */
const CLIENT_NAME = 'Aether'
/** ProgId associé à http/https et aux fichiers .htm/.html/.shtml. */
const PROG_ID = 'AetherHTML'

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

/** Échappe `\` et `"` pour une valeur chaîne insérée dans un fichier `.reg`. */
function regEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Construit le contenu du fichier `.reg` qui déclare ÆTHER candidat navigateur. */
function buildRegistrationScript(exePath: string): string {
  const exe = regEscape(exePath)
  const capabilitiesKey = regEscape(`Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\Capabilities`)
  return (
    'Windows Registry Editor Version 5.00\r\n\r\n' +
    `[HKEY_CURRENT_USER\\Software\\Classes\\${PROG_ID}]\r\n` +
    '@="Document ÆTHER"\r\n\r\n' +
    `[HKEY_CURRENT_USER\\Software\\Classes\\${PROG_ID}\\DefaultIcon]\r\n` +
    `@="\\"${exe}\\",0"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\${PROG_ID}\\shell\\open\\command]\r\n` +
    `@="\\"${exe}\\" \\"%1\\""\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}]\r\n` +
    '@="ÆTHER"\r\n\r\n' +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\DefaultIcon]\r\n` +
    `@="\\"${exe}\\",0"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\shell\\open\\command]\r\n` +
    `@="\\"${exe}\\""\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\Capabilities]\r\n` +
    '"ApplicationName"="ÆTHER"\r\n' +
    `"ApplicationIcon"="\\"${exe}\\",0"\r\n` +
    '"ApplicationDescription"="ÆTHER — un espace de pensée et d\'action augmenté pour le web"\r\n\r\n' +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\Capabilities\\URLAssociations]\r\n` +
    `"http"="${PROG_ID}"\r\n` +
    `"https"="${PROG_ID}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\${CLIENT_NAME}\\Capabilities\\FileAssociations]\r\n` +
    `".htm"="${PROG_ID}"\r\n` +
    `".html"="${PROG_ID}"\r\n` +
    `".shtml"="${PROG_ID}"\r\n\r\n` +
    '[HKEY_CURRENT_USER\\Software\\RegisteredApplications]\r\n' +
    `"${CLIENT_NAME}"="${capabilitiesKey}"\r\n`
  )
}

/** Enregistre ÆTHER comme candidat navigateur — sans effet sur le choix RÉEL
 * de l'utilisateur (voir le commentaire d'en-tête). */
export function registerAsDefaultBrowserCandidate(): void {
  if (isPortableBuild()) return
  const tmpFile = join(app.getPath('temp'), `aether-default-browser-${process.pid}.reg`)
  try {
    // BOM UTF-16LE (octets FF FE) obligatoire : `reg.exe` n'accepte un
    // fichier .reg contenant des caractères hors ASCII (Æ, é, à…) que sous
    // cette forme précise — sans lui, l'import échoue silencieusement ou
    // corrompt les chaînes accentuées. Construit en octets bruts plutôt que
    // via un caractère U+FEFF dans le code source, pour éviter tout risque
    // de ré-encodage silencieux de ce caractère invisible en transit.
    const script = buildRegistrationScript(app.getPath('exe'))
    const bom = Buffer.from([0xff, 0xfe])
    writeFileSync(tmpFile, Buffer.concat([bom, Buffer.from(script, 'utf16le')]))
    // `reg.exe` (l'outil ligne de commande) importe en silence, sans jamais
    // la boîte de dialogue de confirmation que déclenche un double-clic sur
    // un .reg via l'interface de `regedit.exe` — les deux sont des binaires
    // distincts. `windowsHide` évite en plus le flash de fenêtre console.
    execFileSync('reg', ['import', tmpFile], { windowsHide: true, stdio: 'ignore' })
  } catch {
    // Écriture registre refusée (permissions, antivirus…) — sans conséquence
    // bloquante : la bannière proposera simplement de réessayer plus tard,
    // `isDefaultBrowser()` continuera de refléter l'état réel du système.
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      // Fichier temporaire déjà absent ou verrouillé — sans conséquence, le
      // dossier temp système est de toute façon purgé périodiquement.
    }
  }
}

/** Lit le ProgId que Windows associe RÉELLEMENT à un protocole — le choix
 * signé par l'utilisateur via `ms-settings:defaultapps` (`UserChoice`), pas
 * une simple présence de clé. C'est le seul signal qu'ÆTHER ne peut pas
 * avoir écrit lui-même : contrairement à l'ancien `isDefaultProtocolClient`
 * (qui relisait la clé pré-Windows 8 qu'`app.setAsDefaultProtocolClient`
 * venait tout juste d'écrire — d'où le faux positif signalé), `UserChoice`
 * n'est modifiable que par l'UI Windows elle-même. */
function queryUserChoiceProgId(protocol: 'http' | 'https'): string | null {
  try {
    const output = execFileSync(
      'reg',
      [
        'query',
        `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`,
        '/v',
        'ProgId'
      ],
      { windowsHide: true, encoding: 'utf8' }
    )
    const match = /ProgId\s+REG_SZ\s+(\S+)/.exec(output)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** ÆTHER est-il ACTUELLEMENT le navigateur par défaut ? Les deux protocoles
 * sont vérifiés : Windows peut désolidariser http et https (rare, mais un
 * système propre les traite toujours ensemble). Toujours `false` en portable
 * — ÆTHER n'y est jamais enregistré, voir `isPortableBuild`. */
export function isDefaultBrowser(): boolean {
  if (isPortableBuild()) return false
  return queryUserChoiceProgId('http') === PROG_ID && queryUserChoiceProgId('https') === PROG_ID
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
