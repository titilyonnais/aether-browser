/**
 * Système d'extensions — équivalent du mode développeur de Chrome/Edge/Brave,
 * PLUS une installation réelle depuis le vrai Chrome Web Store.
 *
 * Le Web Store lui-même se navigue normalement (une WebContentsView comme
 * une autre) : aucune usurpation d'identité de Chrome. Son propre bouton
 * « Ajouter à Chrome » est grisé par Google pour tout navigateur non reconnu
 * (Electron inclus) — un script injecté très tôt (voir WEBSTORE_HOOK_SCRIPT
 * dans viewManager.ts) fournit ce qui manque pour le débloquer (Client Hints +
 * shim de l'API interne chrome.webstorePrivate), redirigé vers notre propre
 * popup de confirmation plutôt que vers le vrai binaire Chrome. Une fois
 * confirmé, cette fonction télécharge réellement le paquet `.crx` depuis le
 * point de distribution public de Google (`clients2.google.com`, utilisé par
 * de nombreux outils open-source pour ce même usage), puis charge l'extension
 * une fois extraite — via le même `session.extensions.loadExtension` déjà
 * utilisé pour les extensions non empaquetées ci-dessous.
 */
import { app, dialog, session, type BrowserWindow, type Extension } from 'electron'
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ExtensionInfo, ProfileId } from '@shared/types'
import { extensionsRepo } from './db/repositories'

interface ActionLike {
  default_icon?: string | Record<string, string>
}

interface ManifestLike {
  name?: string
  description?: string
  version?: string
  default_locale?: string
  icons?: Record<string, string>
  permissions?: string[]
  host_permissions?: string[]
  options_page?: string
  options_ui?: { page?: string }
  // Beaucoup d'extensions MV3 minimalistes ne déclarent PAS d'`icons` racine,
  // seulement l'icône de leur bouton de barre d'outils — sans ce repli, ces
  // extensions n'avaient jamais d'icône (générique affichée à la place).
  action?: ActionLike
  browser_action?: ActionLike
  page_action?: ActionLike
}

/** Trouve le fichier icône le plus probable — `icons` racine en priorité
 * (généralement la plus grande résolution en dernier), sinon l'icône du
 * bouton de barre d'outils (`action`/`browser_action`/`page_action`, MV3 ou MV2). */
function resolveIconFile(manifest: ManifestLike): string | null {
  if (manifest.icons) {
    const fromIcons = Object.values(manifest.icons).at(-1)
    if (fromIcons) return fromIcons
  }
  const actionIcon =
    manifest.action?.default_icon ?? manifest.browser_action?.default_icon ?? manifest.page_action?.default_icon
  if (!actionIcon) return null
  return typeof actionIcon === 'string' ? actionIcon : (Object.values(actionIcon).at(-1) ?? null)
}

/** Libellés lisibles des permissions les plus courantes — au mieux, comme
 * Chrome ; les permissions non reconnues gardent leur identifiant brut plutôt
 * que de ne rien afficher. */
const PERMISSION_LABELS: Record<string, string> = {
  '<all_urls>': 'Lire et modifier toutes vos données sur tous les sites Web',
  tabs: 'Lire vos onglets et votre activité de navigation',
  activeTab: "Accéder à l'onglet actif quand vous cliquez sur l'extension",
  storage: 'Stocker des données localement',
  cookies: 'Lire et modifier les cookies',
  webRequest: 'Observer et modifier le trafic réseau',
  webRequestBlocking: 'Bloquer ou modifier des requêtes réseau',
  notifications: 'Afficher des notifications',
  clipboardRead: 'Lire le presse-papiers',
  clipboardWrite: 'Modifier le presse-papiers',
  geolocation: 'Accéder à votre position',
  history: "Lire et modifier l'historique de navigation",
  bookmarks: 'Lire et modifier vos favoris',
  downloads: 'Gérer vos téléchargements',
  management: 'Gérer vos autres extensions',
  scripting: 'Injecter du code dans les pages visitées',
  declarativeNetRequest: 'Bloquer ou modifier des requêtes réseau'
}

/** Libellé d'une permission d'hôte (ex. host_permissions comme https://example.com/*). */
function hostPermissionLabel(pattern: string): string {
  if (pattern === '<all_urls>' || /^\*:\/\/\*\/\*?$/.test(pattern)) {
    return 'Lire et modifier vos données sur tous les sites Web'
  }
  const host = pattern.replace(/^\*+:\/\//, '').replace(/\/.*$/, '')
  return `Lire et modifier vos données sur ${host}`
}

function permissionLabels(manifest: ManifestLike): string[] {
  const raw = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])]
  const labels = raw.map((p) => PERMISSION_LABELS[p] ?? (p.includes('://') || p === '<all_urls>' ? hostPermissionLabel(p) : p))
  return Array.from(new Set(labels))
}

/** Taille cumulée d'un dossier (récursive) — approximation suffisante pour un affichage
 * informatif, pas une mesure exacte au bloc disque près. */
function dirSize(dir: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) total += dirSize(full)
      else if (entry.isFile()) total += statSync(full).size
    }
  } catch {
    // Dossier illisible/disparu — taille partielle ou nulle, sans conséquence grave.
  }
  return total
}

/** Résout un champ internationalisé (`"name"`/`"description": "__MSG_x__"`, très
 * courant sur le Store) via `_locales/<locale>/messages.json` — sinon ce champ ne
 * serait jamais qu'un identifiant de message brut, jamais le vrai texte lisible.
 * `fallback` est renvoyé si le champ est absent ou que la résolution échoue. */
function resolveI18nMessage(folderPath: string, manifest: ManifestLike, raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  const match = /^__MSG_(.+)__$/.exec(raw)
  if (!match) return raw
  const key = match[1]
  const locales = [manifest.default_locale, manifest.default_locale?.replace('-', '_'), 'en', 'en_US'].filter(
    (l): l is string => Boolean(l)
  )
  for (const locale of locales) {
    try {
      const raw2 = readFileSync(join(folderPath, '_locales', locale, 'messages.json'), 'utf8')
      const messages = JSON.parse(raw2) as Record<string, { message?: string }>
      const message = messages[key]?.message
      if (message) return message
    } catch {
      // Ce dossier de locale n'existe pas — on tente le suivant.
    }
  }
  return fallback
}

function readManifestName(folderPath: string): string {
  try {
    const raw = readFileSync(join(folderPath, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(raw) as ManifestLike
    return resolveI18nMessage(folderPath, manifest, manifest.name, 'Extension')
  } catch {
    return 'Extension'
  }
}

/** Ouvre un sélecteur de dossier pour choisir une extension non empaquetée. */
export async function chooseExtensionFolder(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Charger une extension non empaquetée',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Dossier racine des extensions extraites depuis le Store (à l'image de userData/avatars). */
function webStoreExtensionsRoot(): string {
  return join(app.getPath('userData'), 'extensions')
}

function toInfo(
  row: { id: string; extensionId: string | null; name: string; path: string; enabled: boolean; addedAt: number },
  loaded: Extension | null
): ExtensionInfo {
  const manifest = (loaded?.manifest as ManifestLike | undefined) ?? readManifestSafe(row.path)
  const iconFile = resolveIconFile(manifest)
  const isWebstore = row.path.startsWith(webStoreExtensionsRoot())
  const optionsPage = manifest.options_ui?.page ?? manifest.options_page ?? null
  return {
    id: row.id,
    extensionId: row.extensionId,
    name: row.name,
    description: resolveI18nMessage(row.path, manifest, manifest.description, ''),
    version: manifest.version ?? '',
    sizeBytes: dirSize(row.path),
    permissions: permissionLabels(manifest),
    source: isWebstore ? 'webstore' : 'local',
    storeUrl: isWebstore ? `https://chromewebstore.google.com/detail/${basename(row.path)}` : null,
    optionsUrl: optionsPage && row.extensionId ? `chrome-extension://${row.extensionId}/${optionsPage}` : null,
    path: row.path,
    enabled: row.enabled,
    addedAt: row.addedAt,
    // `file://${join(...)}` produisait une URL invalide sous Windows (backslashes,
    // pas de 3e slash pour la lettre de lecteur) — `pathToFileURL` gère ça correctement.
    iconUrl: iconFile ? pathToFileURL(join(row.path, iconFile)).href : null
  }
}

/** Comme readManifestName mais renvoie le manifeste entier — utilisé quand
 * l'extension n'est pas (ou plus) chargée en session (`loaded` absent). */
function readManifestSafe(folderPath: string): ManifestLike {
  try {
    return JSON.parse(readFileSync(join(folderPath, 'manifest.json'), 'utf8')) as ManifestLike
  } catch {
    return {}
  }
}

/** Charge dans la session une extension non empaquetée et l'enregistre. */
export async function addUnpackedExtension(
  profileId: ProfileId,
  partition: string,
  folderPath: string
): Promise<ExtensionInfo | null> {
  if (!existsSync(join(folderPath, 'manifest.json'))) return null
  const name = readManifestName(folderPath)
  const webSession = session.fromPartition(partition)
  try {
    const loaded = await webSession.extensions.loadExtension(folderPath, { allowFileAccess: true })
    const id = extensionsRepo.add(profileId, folderPath, name)
    extensionsRepo.setExtensionId(id, loaded.id)
    return toInfo({ id, extensionId: loaded.id, name, path: folderPath, enabled: true, addedAt: Date.now() }, loaded)
  } catch {
    return null
  }
}

/** Recharge dans la session toutes les extensions activées d'un profil (au démarrage). */
export async function loadExtensionsForProfile(profileId: ProfileId, partition: string): Promise<void> {
  const rows = extensionsRepo.listByProfile(profileId)
  const webSession = session.fromPartition(partition)
  for (const row of rows) {
    if (!row.enabled || !existsSync(join(row.path, 'manifest.json'))) continue
    try {
      const loaded = await webSession.extensions.loadExtension(row.path, { allowFileAccess: true })
      if (loaded.id !== row.extensionId) extensionsRepo.setExtensionId(row.id, loaded.id)
      // Auto-guérison du nom (voir installExtensionFromWebStore) : une ligne
      // enregistrée avant la résolution i18n peut porter un nom vide/brut.
      const freshName = readManifestName(row.path)
      if (freshName !== row.name) extensionsRepo.setName(row.id, freshName)
    } catch {
      // Dossier déplacé/supprimé entretemps — ignoré silencieusement.
    }
  }
}

export function listExtensions(profileId: ProfileId, partition: string): ExtensionInfo[] {
  const webSession = session.fromPartition(partition)
  const loadedById = new Map(webSession.extensions.getAllExtensions().map((e) => [e.id, e]))
  return extensionsRepo
    .listByProfile(profileId)
    .map((row) => toInfo(row, row.extensionId ? (loadedById.get(row.extensionId) ?? null) : null))
}

export async function setExtensionEnabled(
  profileId: ProfileId,
  partition: string,
  id: string,
  enabled: boolean
): Promise<void> {
  const rows = extensionsRepo.listByProfile(profileId)
  const row = rows.find((r) => r.id === id)
  if (!row) return
  extensionsRepo.setEnabled(id, enabled)
  const webSession = session.fromPartition(partition)
  if (!enabled && row.extensionId) {
    webSession.extensions.removeExtension(row.extensionId)
  } else if (enabled && existsSync(join(row.path, 'manifest.json'))) {
    try {
      const loaded = await webSession.extensions.loadExtension(row.path, { allowFileAccess: true })
      extensionsRepo.setExtensionId(id, loaded.id)
    } catch {
      // Rechargement impossible — l'utilisateur le verra désactivé.
    }
  }
}

export function removeExtension(profileId: ProfileId, partition: string, id: string): void {
  const rows = extensionsRepo.listByProfile(profileId)
  const row = rows.find((r) => r.id === id)
  if (!row) return
  if (row.extensionId) {
    try {
      session.fromPartition(partition).extensions.removeExtension(row.extensionId)
    } catch {
      // Déjà déchargée — sans conséquence.
    }
  }
  extensionsRepo.remove(id)
}

// ─── Installation réelle depuis le Chrome Web Store ────────────────────────

function webStoreExtensionDir(extensionId: string): string {
  return join(webStoreExtensionsRoot(), extensionId)
}

/** Retire l'en-tête CRX (CRX2 ou CRX3) pour ne garder que le ZIP qu'il enveloppe. */
function stripCrxHeader(buf: Buffer): Buffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'Cr24') {
    throw new Error("Fichier .crx invalide (en-tête « Cr24 » absente)")
  }
  const version = buf.readUInt32LE(4)
  if (version === 3) {
    const headerSize = buf.readUInt32LE(8)
    return buf.subarray(12 + headerSize)
  }
  if (version === 2) {
    const pubKeyLength = buf.readUInt32LE(8)
    const sigLength = buf.readUInt32LE(12)
    return buf.subarray(16 + pubKeyLength + sigLength)
  }
  throw new Error(`Version de CRX non supportée (${version})`)
}

/** Point de distribution public non authentifié de Google — celui que le vrai bouton
 * « Installer » du Store appelle en coulisses (utilisé tel quel, sans usurpation d'identité). */
function webStoreCrxUrl(extensionId: string): string {
  const query = `id=${extensionId}&installsource=ondemand&uc`
  return `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=120.0.0.0&x=${encodeURIComponent(query)}`
}

export interface WebStoreInstallResult {
  ok: boolean
  name: string | null
  alreadyInstalled: boolean
  error: string | null
}

/** Extensions en cours d'installation — évite un double-téléchargement sur double-clic. */
const installsInFlight = new Set<string>()

/**
 * Télécharge, extrait et charge une extension à partir de son identifiant,
 * en réponse à un vrai clic sur « Installer » intercepté sur le Store
 * (voir viewManager.ts). Réutilise le mécanisme d'extension non empaquetée
 * existant une fois le `.crx` extrait dans son propre dossier.
 */
export async function installExtensionFromWebStore(
  profileId: ProfileId,
  partition: string,
  extensionId: string
): Promise<WebStoreInstallResult> {
  if (installsInFlight.has(extensionId)) {
    return { ok: false, name: null, alreadyInstalled: false, error: 'Installation déjà en cours' }
  }
  const dir = webStoreExtensionDir(extensionId)
  const already = extensionsRepo.listByProfile(profileId).find((r) => r.path === dir)
  if (already) {
    await setExtensionEnabled(profileId, partition, already.id, true)
    // Auto-guérison : une installation antérieure (avant la résolution i18n du
    // nom, ou un manifest.json disparu depuis) a pu enregistrer un nom vide ou
    // brut (`__MSG_x__`) — on le recalcule et on corrige la ligne en base.
    const freshName = existsSync(join(dir, 'manifest.json')) ? readManifestName(dir) : already.name
    if (freshName !== already.name) extensionsRepo.setName(already.id, freshName)
    return { ok: true, name: freshName, alreadyInstalled: true, error: null }
  }

  installsInFlight.add(extensionId)
  try {
    const res = await fetch(webStoreCrxUrl(extensionId))
    if (!res.ok) {
      return { ok: false, name: null, alreadyInstalled: false, error: `Téléchargement impossible (HTTP ${res.status})` }
    }
    const crxBuf = Buffer.from(await res.arrayBuffer())
    const zipBuf = stripCrxHeader(crxBuf)

    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    new AdmZip(zipBuf).extractAllTo(dir, true)

    if (!existsSync(join(dir, 'manifest.json'))) {
      rmSync(dir, { recursive: true, force: true })
      return { ok: false, name: null, alreadyInstalled: false, error: 'Paquet invalide (manifest.json introuvable)' }
    }

    const name = readManifestName(dir)
    const webSession = session.fromPartition(partition)
    const loaded = await webSession.extensions.loadExtension(dir, { allowFileAccess: true })
    const rowId = extensionsRepo.add(profileId, dir, name)
    extensionsRepo.setExtensionId(rowId, loaded.id)
    return { ok: true, name, alreadyInstalled: false, error: null }
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    return { ok: false, name: null, alreadyInstalled: false, error: err instanceof Error ? err.message : 'Erreur inconnue' }
  } finally {
    installsInFlight.delete(extensionId)
  }
}
