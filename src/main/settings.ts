/**
 * Gestion des réglages applicatifs.
 * Les clés API sont chiffrées au repos via safeStorage (DPAPI sous Windows)
 * et ne quittent jamais le processus principal — le renderer ne reçoit que
 * des drapeaux `has*Key`.
 */
import { safeStorage } from 'electron'
import { totalmem } from 'node:os'
import type { ApiProviderKind, AppSettings, FocusState, NewTabWidgets, SettingsPatch, WindowState } from '@shared/types'
import { kvRepo } from './db/repositories'

/** Valeur INITIALE (l'utilisateur peut toujours ajuster le curseur ensuite,
 * cf. Réglages › Performance — ce choix explicite est alors mémorisé et ne
 * repasse plus jamais par ce calcul) — plus généreuse sur une machine avec
 * beaucoup de RAM, plus prudente sur une machine modeste, plutôt qu'une
 * valeur fixe identique pour tout le monde. Bornes alignées sur le curseur
 * existant (2-12, `applySettingsPatch`). */
function defaultMaxLivePages(): number {
  const gb = totalmem() / 1024 ** 3
  if (gb < 8) return 4
  if (gb < 16) return 6
  if (gb < 32) return 8
  return 10
}

const DEFAULTS: Omit<AppSettings, 'hasAnthropicKey' | 'hasOpenaiKey' | 'hasXaiKey' | 'hasSmtpConfig'> = {
  aiProvider: 'auto',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  ollamaEmbedModel: '',
  anthropicModel: 'claude-sonnet-5',
  openaiModel: 'gpt-4o-mini',
  xaiModel: 'grok-3',
  searchEngine: 'duckduckgo',
  theme: 'dark',
  accent: 'glacier',
  accentCustom: '',
  backgroundImage: null,
  showFavoritesBar: false,
  groupFavoritesBySpace: true,
  wideAddressBar: false,
  showPageStrip: false,
  showTabHoverPreview: true,
  uiScale: 1,
  showConstellationOnLaunch: true,
  showMuseOnLaunch: true,
  startupTabs: 'newtab',
  homepage: '',
  newTabUrl: '',
  newTabShortcuts: [],
  newTabHiddenRecentIds: [],
  newTabGridSize: 10,
  newTabWidgets: { clock: true, weather: false, news: false },
  newTabWeatherLocation: null,
  newTabNewsStyle: 'text',
  defaultZoom: 1,
  allowMedia: false,
  allowGeolocation: false,
  allowNotifications: false,
  doNotTrack: false,
  httpsOnly: false,
  maxLivePages: defaultMaxLivePages(),
  spellcheck: true,
  spellcheckLanguages: [],
  neverTranslateDomains: [],
  alwaysTranslateLanguages: [],
  proxyMode: 'system',
  proxyRules: '',
  minimizeOnClose: false,
  devtoolsDockMode: 'detach',
  downloadDir: '',
  askDownloadLocation: true,
  autoCheckForUpdates: true,
  onboarded: false
}

const SECRET_KEYS: Record<ApiProviderKind, string> = {
  anthropic: 'secret.anthropic',
  openai: 'secret.openai',
  xai: 'secret.xai'
}

// ─── Secrets ─────────────────────────────────────────────────────────────────

/** Chiffrement générique (DPAPI via `safeStorage`, repli brut si indisponible)
 * — utilisé aussi bien pour les clés IA que pour la config SMTP ci-dessous. */
function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64')
  }
  // Repli très rare (DPAPI indisponible) — stockage brut signalé par préfixe.
  return 'raw:' + Buffer.from(value, 'utf8').toString('base64')
}

function decryptValue(stored: string): string | null {
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('raw:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf8')
    }
  } catch {
    // Clé illisible (profil changé…) → considérée absente.
  }
  return null
}

function storeSecret(provider: ApiProviderKind, value: string | null): void {
  const key = SECRET_KEYS[provider]
  if (value === null || value.trim() === '') {
    kvRepo.remove(key)
    return
  }
  kvRepo.set(key, encryptValue(value.trim()))
}

export function readSecret(provider: ApiProviderKind): string | null {
  const stored = kvRepo.get(SECRET_KEYS[provider])
  return stored ? decryptValue(stored) : null
}

export function hasSecret(provider: ApiProviderKind): boolean {
  return kvRepo.get(SECRET_KEYS[provider]) !== null
}

// ─── SMTP (rapport de bug) ────────────────────────────────────────────────────
// Config du relais SMTP utilisé pour "Signaler un problème" — appartient au
// DÉVELOPPEUR (moi), jamais à l'utilisateur final : pas d'UI Réglages, juste
// une graine ponctuelle depuis des variables d'environnement au premier
// lancement qui en dispose (voir `seedSmtpConfigFromEnv`, main/index.ts).
// Chiffré via le même mécanisme que les clés IA, jamais exposé par IPC.

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

const SMTP_KEY = 'secret.smtp'

export function storeSmtpConfig(config: SmtpConfig): void {
  kvRepo.set(SMTP_KEY, encryptValue(JSON.stringify(config)))
}

export function readSmtpConfig(): SmtpConfig | null {
  const stored = kvRepo.get(SMTP_KEY)
  if (!stored) return null
  const decrypted = decryptValue(stored)
  if (!decrypted) return null
  try {
    return JSON.parse(decrypted) as SmtpConfig
  } catch {
    return null
  }
}

export function hasSmtpConfig(): boolean {
  return kvRepo.get(SMTP_KEY) !== null
}

/** Graine ponctuelle : si `AETHER_SMTP_HOST`/`_PORT`/`_USER`/`_PASS` sont
 * posées dans l'environnement ET qu'aucune config n'est encore stockée, les
 * chiffre une fois dans la DB locale. Sert UNE SEULE FOIS après un `npm run
 * dev`/lancement avec ces variables posées (ex. dans un `.env.local` local,
 * jamais committé) — la DB les retient ensuite, plus besoin de les reposer. */
export function seedSmtpConfigFromEnv(): void {
  if (hasSmtpConfig()) return
  const host = process.env['AETHER_SMTP_HOST']
  const port = process.env['AETHER_SMTP_PORT']
  const user = process.env['AETHER_SMTP_USER']
  const pass = process.env['AETHER_SMTP_PASS']
  if (!host || !port || !user || !pass) return
  const portNum = Number(port)
  if (!Number.isFinite(portNum)) return
  storeSmtpConfig({ host, port: portNum, user, pass })
}

// ─── Réglages ────────────────────────────────────────────────────────────────

function getString<K extends keyof typeof DEFAULTS>(key: K): (typeof DEFAULTS)[K] {
  const raw = kvRepo.get('settings.' + key)
  if (raw === null) return DEFAULTS[key]
  try {
    return JSON.parse(raw) as (typeof DEFAULTS)[K]
  } catch {
    return DEFAULTS[key]
  }
}

function putValue(key: keyof typeof DEFAULTS, value: unknown): void {
  kvRepo.set('settings.' + key, JSON.stringify(value))
}

export function getSettings(): AppSettings {
  return {
    aiProvider: getString('aiProvider'),
    ollamaBaseUrl: getString('ollamaBaseUrl'),
    ollamaModel: getString('ollamaModel'),
    ollamaEmbedModel: getString('ollamaEmbedModel'),
    anthropicModel: getString('anthropicModel'),
    openaiModel: getString('openaiModel'),
    xaiModel: getString('xaiModel'),
    searchEngine: getString('searchEngine'),
    theme: getString('theme'),
    accent: getString('accent'),
    accentCustom: getString('accentCustom'),
    backgroundImage: getString('backgroundImage'),
    showFavoritesBar: getString('showFavoritesBar'),
    groupFavoritesBySpace: getString('groupFavoritesBySpace'),
    wideAddressBar: getString('wideAddressBar'),
    showPageStrip: getString('showPageStrip'),
    showTabHoverPreview: getString('showTabHoverPreview'),
    uiScale: getString('uiScale'),
    showConstellationOnLaunch: getString('showConstellationOnLaunch'),
    showMuseOnLaunch: getString('showMuseOnLaunch'),
    startupTabs: getString('startupTabs'),
    homepage: getString('homepage'),
    newTabUrl: getString('newTabUrl'),
    newTabShortcuts: getString('newTabShortcuts'),
    newTabHiddenRecentIds: getString('newTabHiddenRecentIds'),
    newTabGridSize: getString('newTabGridSize'),
    newTabWidgets: getString('newTabWidgets'),
    newTabWeatherLocation: getString('newTabWeatherLocation'),
    newTabNewsStyle: getString('newTabNewsStyle'),
    defaultZoom: getString('defaultZoom'),
    allowMedia: getString('allowMedia'),
    allowGeolocation: getString('allowGeolocation'),
    allowNotifications: getString('allowNotifications'),
    doNotTrack: getString('doNotTrack'),
    httpsOnly: getString('httpsOnly'),
    maxLivePages: getString('maxLivePages'),
    spellcheck: getString('spellcheck'),
    spellcheckLanguages: getString('spellcheckLanguages'),
    neverTranslateDomains: getString('neverTranslateDomains'),
    alwaysTranslateLanguages: getString('alwaysTranslateLanguages'),
    proxyMode: getString('proxyMode'),
    proxyRules: getString('proxyRules'),
    minimizeOnClose: getString('minimizeOnClose'),
    devtoolsDockMode: getString('devtoolsDockMode'),
    downloadDir: getString('downloadDir'),
    askDownloadLocation: getString('askDownloadLocation'),
    autoCheckForUpdates: getString('autoCheckForUpdates'),
    onboarded: getString('onboarded'),
    hasAnthropicKey: hasSecret('anthropic'),
    hasOpenaiKey: hasSecret('openai'),
    hasXaiKey: hasSecret('xai'),
    hasSmtpConfig: hasSmtpConfig()
  }
}

/** N'accepte que `http(s):` — un `ollamaBaseUrl` malformé ou à schéma
 * inattendu (`file:`, `javascript:`…) stocké tel quel referait surface plus
 * tard dans un `fetch()` bas niveau (providers.ts) avec un comportement
 * imprévisible. Pas de restriction réseau privé/local en plus : un Ollama
 * auto-hébergé sur une autre machine du LAN (ou distante) est un usage
 * légitime, pas seulement `127.0.0.1`. */
function isValidOllamaBaseUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol)
  } catch {
    return false
  }
}

export function applySettingsPatch(patch: SettingsPatch): AppSettings {
  if (patch.aiProvider !== undefined) putValue('aiProvider', patch.aiProvider)
  if (patch.ollamaBaseUrl !== undefined) {
    const trimmed = patch.ollamaBaseUrl.trim()
    if (isValidOllamaBaseUrl(trimmed)) putValue('ollamaBaseUrl', trimmed)
  }
  if (patch.ollamaModel !== undefined) putValue('ollamaModel', patch.ollamaModel)
  if (patch.ollamaEmbedModel !== undefined) putValue('ollamaEmbedModel', patch.ollamaEmbedModel)
  if (patch.anthropicModel !== undefined) putValue('anthropicModel', patch.anthropicModel.trim())
  if (patch.openaiModel !== undefined) putValue('openaiModel', patch.openaiModel.trim())
  if (patch.xaiModel !== undefined) putValue('xaiModel', patch.xaiModel.trim())
  if (patch.searchEngine !== undefined) putValue('searchEngine', patch.searchEngine)
  if (patch.theme !== undefined) putValue('theme', patch.theme)
  if (patch.accent !== undefined) putValue('accent', patch.accent)
  if (patch.accentCustom !== undefined) putValue('accentCustom', patch.accentCustom)
  if (patch.backgroundImage !== undefined) putValue('backgroundImage', patch.backgroundImage)
  if (patch.showFavoritesBar !== undefined) putValue('showFavoritesBar', patch.showFavoritesBar)
  if (patch.groupFavoritesBySpace !== undefined) {
    putValue('groupFavoritesBySpace', patch.groupFavoritesBySpace)
  }
  if (patch.wideAddressBar !== undefined) putValue('wideAddressBar', patch.wideAddressBar)
  if (patch.showPageStrip !== undefined) putValue('showPageStrip', patch.showPageStrip)
  if (patch.showTabHoverPreview !== undefined) {
    putValue('showTabHoverPreview', patch.showTabHoverPreview)
  }
  if (patch.uiScale !== undefined) {
    putValue('uiScale', Math.min(1.3, Math.max(0.85, patch.uiScale)))
  }
  if (patch.showConstellationOnLaunch !== undefined) {
    putValue('showConstellationOnLaunch', patch.showConstellationOnLaunch)
  }
  if (patch.showMuseOnLaunch !== undefined) putValue('showMuseOnLaunch', patch.showMuseOnLaunch)
  if (patch.startupTabs !== undefined) putValue('startupTabs', patch.startupTabs)
  if (patch.homepage !== undefined) putValue('homepage', patch.homepage.trim())
  if (patch.newTabUrl !== undefined) putValue('newTabUrl', patch.newTabUrl.trim())
  if (patch.newTabShortcuts !== undefined) {
    putValue(
      'newTabShortcuts',
      patch.newTabShortcuts
        .filter((s) => s.url.trim() !== '')
        .map((s) => ({ id: s.id, title: s.title.trim().slice(0, 60), url: s.url.trim() }))
        .slice(0, 16)
    )
  }
  if (patch.newTabHiddenRecentIds !== undefined) {
    putValue(
      'newTabHiddenRecentIds',
      Array.from(new Set(patch.newTabHiddenRecentIds.filter((id) => id.trim() !== ''))).slice(-500)
    )
  }
  if (patch.newTabGridSize !== undefined) {
    putValue('newTabGridSize', Math.min(20, Math.max(4, Math.round(patch.newTabGridSize))))
  }
  if (patch.newTabWidgets !== undefined) {
    const current: NewTabWidgets = getString('newTabWidgets')
    putValue('newTabWidgets', { ...current, ...patch.newTabWidgets })
  }
  if (patch.newTabWeatherLocation !== undefined) {
    const loc = patch.newTabWeatherLocation
    putValue(
      'newTabWeatherLocation',
      loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
        ? { name: loc.name.trim().slice(0, 80), admin1: loc.admin1.trim().slice(0, 80), country: loc.country.trim().slice(0, 80), lat: loc.lat, lon: loc.lon }
        : null
    )
  }
  if (patch.newTabNewsStyle !== undefined) putValue('newTabNewsStyle', patch.newTabNewsStyle)
  if (patch.defaultZoom !== undefined) {
    putValue('defaultZoom', Math.min(3, Math.max(0.5, patch.defaultZoom)))
  }
  if (patch.allowMedia !== undefined) putValue('allowMedia', patch.allowMedia)
  if (patch.allowGeolocation !== undefined) putValue('allowGeolocation', patch.allowGeolocation)
  if (patch.allowNotifications !== undefined) putValue('allowNotifications', patch.allowNotifications)
  if (patch.doNotTrack !== undefined) putValue('doNotTrack', patch.doNotTrack)
  if (patch.httpsOnly !== undefined) putValue('httpsOnly', patch.httpsOnly)
  if (patch.maxLivePages !== undefined) {
    putValue('maxLivePages', Math.min(12, Math.max(2, Math.round(patch.maxLivePages))))
  }
  if (patch.spellcheck !== undefined) putValue('spellcheck', patch.spellcheck)
  if (patch.spellcheckLanguages !== undefined) {
    putValue('spellcheckLanguages', patch.spellcheckLanguages.filter((l) => l.trim() !== '').slice(0, 20))
  }
  if (patch.neverTranslateDomains !== undefined) {
    putValue(
      'neverTranslateDomains',
      Array.from(new Set(patch.neverTranslateDomains.filter((d) => d.trim() !== ''))).slice(0, 200)
    )
  }
  if (patch.alwaysTranslateLanguages !== undefined) {
    putValue(
      'alwaysTranslateLanguages',
      Array.from(new Set(patch.alwaysTranslateLanguages.filter((l) => l.trim() !== ''))).slice(0, 50)
    )
  }
  if (patch.proxyMode !== undefined) putValue('proxyMode', patch.proxyMode)
  if (patch.proxyRules !== undefined) putValue('proxyRules', patch.proxyRules.trim())
  if (patch.minimizeOnClose !== undefined) putValue('minimizeOnClose', patch.minimizeOnClose)
  if (patch.devtoolsDockMode !== undefined) putValue('devtoolsDockMode', patch.devtoolsDockMode)
  if (patch.downloadDir !== undefined) putValue('downloadDir', patch.downloadDir)
  if (patch.askDownloadLocation !== undefined) putValue('askDownloadLocation', patch.askDownloadLocation)
  if (patch.autoCheckForUpdates !== undefined) putValue('autoCheckForUpdates', patch.autoCheckForUpdates)
  if (patch.onboarded !== undefined) putValue('onboarded', patch.onboarded)
  if (patch.anthropicKey !== undefined) storeSecret('anthropic', patch.anthropicKey)
  if (patch.openaiKey !== undefined) storeSecret('openai', patch.openaiKey)
  if (patch.xaiKey !== undefined) storeSecret('xai', patch.xaiKey)
  return getSettings()
}

/**
 * Réinitialise toutes les préférences à leurs valeurs par défaut.
 * Ne touche NI aux clés API chiffrées, NI aux profils/espaces/pages (mémoire).
 * `onboarded` est préservé pour ne pas relancer l'introduction par surprise.
 */
export function resetSettings(): AppSettings {
  const wasOnboarded = getString('onboarded')
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    putValue(key, DEFAULTS[key])
  }
  putValue('onboarded', wasOnboarded)
  return getSettings()
}

// ─── Divers état applicatif ──────────────────────────────────────────────────

export function getActiveProfileId(): string | null {
  return kvRepo.get('state.activeProfileId')
}

export function setActiveProfileId(id: string): void {
  kvRepo.set('state.activeProfileId', id)
}

/** L'espace actif est mémorisé par profil. */
export function getActiveSpaceId(profileId: string): string | null {
  return kvRepo.get(`state.activeSpaceId.${profileId}`)
}

export function setActiveSpaceId(profileId: string, id: string): void {
  kvRepo.set(`state.activeSpaceId.${profileId}`, id)
}

/** État Focus (page(s) au premier plan) mémorisé par espace — toujours écrit,
 * consulté au démarrage seulement si `startupTabs === 'restore'`. */
export function getFocusState(spaceId: string): FocusState | null {
  const raw = kvRepo.get(`state.focus.${spaceId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as FocusState
  } catch {
    return null
  }
}

export function setFocusState(spaceId: string, state: FocusState): void {
  kvRepo.set(`state.focus.${spaceId}`, JSON.stringify(state))
}

/** Taille/position/agrandissement/plein écran de la fenêtre principale —
 * restauré au prochain lancement (main/mainWindow.ts). */
export function getWindowState(): WindowState | null {
  const raw = kvRepo.get('state.window')
  if (!raw) return null
  try {
    return JSON.parse(raw) as WindowState
  } catch {
    return null
  }
}

export function setWindowState(state: WindowState): void {
  kvRepo.set('state.window', JSON.stringify(state))
}
