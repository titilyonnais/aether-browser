/**
 * Types partagés entre le processus principal, le preload et le renderer.
 * Uniquement des structures sérialisables — aucune dépendance Electron/DOM.
 */

export type SpaceId = string
export type PageId = string
export type ProfileId = string

/** Genre d'avatar de profil : rien (initiale nue), icône+fond, ou image importée. */
export type AvatarKind = 'none' | 'icon' | 'image'

/** Profil : session (cookies/connexions) et espace de travail cloisonnés, façon Chrome. */
export interface Profile {
  id: ProfileId
  name: string
  /** Teinte HSL (0-360) — identité visuelle par défaut (favoris groupés, etc.). */
  hue: number
  avatarKind: AvatarKind
  /** Emoji/caractère affiché si avatarKind === 'icon'. */
  avatarIcon: string
  /** Couleur de fond (hex) si avatarKind === 'icon'. */
  avatarColor: string
  /** Nom de fichier sous userData/avatars/ si avatarKind === 'image' (servi via aether://avatars/). */
  avatarImage: string
  /** Profil de navigation privée : session en mémoire, jamais persisté au-delà de sa durée de vie. */
  isPrivate: boolean
  position: number
  createdAt: number
}

/** Rectangle en pixels (coordonnées fenêtre, DIP). */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** État de la fenêtre principale, restauré au prochain lancement. */
export interface WindowState {
  isMaximized: boolean
  isFullScreen: boolean
  /** Bornes « normales » (ni agrandie ni plein écran) — voir `getNormalBounds()`. */
  bounds: Bounds
}

/** Position/taille d'une carte sur la toile spatiale (coordonnées monde). */
export interface CanvasRect {
  x: number
  y: number
  w: number
  h: number
}

/** Caméra d'une toile spatiale (pan + zoom). */
export interface CanvasView {
  x: number
  y: number
  zoom: number
}

export interface Space {
  id: SpaceId
  name: string
  /** Teinte HSL (0-360) — identité visuelle de l'espace. */
  hue: number
  position: number
  canvas: CanvasView
  createdAt: number
}

export interface PageMeta {
  id: PageId
  spaceId: SpaceId
  url: string
  title: string
  faviconUrl: string | null
  parentId: PageId | null
  canvas: CanvasRect
  previewVersion: number
  createdAt: number
  lastVisitedAt: number
  /** Position dans la bande de pages (ordre modifiable par glisser). */
  position: number
  /** Son coupé pour cette page. */
  muted: boolean
  // — État runtime (non persisté) —
  isLive: boolean
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  loadError: string | null
}

/** État Focus (vue scindée) d'un espace — quelles pages sont au premier plan.
 * Persisté par espace (voir main/settings.ts) pour permettre de le restaurer
 * au démarrage si `startupTabs === 'restore'`. */
export interface FocusState {
  /** Pages affichées (1 ou 2 en vue scindée). */
  slots: PageId[]
  orientation: 'h' | 'v'
  ratio: number
  activeSlot: number
}

/** Dossier de rangement des favoris (façon chrome://bookmarks). */
export interface FavoriteFolder {
  id: string
  name: string
  position: number
  createdAt: number
}

/**
 * Un favori (signet) — entité à part entière, indépendante des pages/onglets
 * (comme un signet Chrome) : survit à la fermeture de son onglet d'origine,
 * puisqu'il n'est plus une simple case cochée sur une ligne `pages`.
 */
export interface Favorite {
  id: string
  url: string
  title: string
  faviconUrl: string | null
  /** Espace d'origine (pastille de couleur dans la barre/gestion) — peut être null si l'espace a été supprimé depuis. */
  spaceId: SpaceId | null
  /** Dossier de rangement, ou null = sans dossier. */
  folderId: string | null
  /** Position (bande de favoris, glisser-déposer). */
  position: number
  createdAt: number
}

/** Référence légère vers un favori/dossier en débordement de la barre — le
 * main réhydrate lui-même les détails (titre, url…) pour construire le menu
 * natif, la fenêtre principale n'a besoin d'envoyer que ces ids. */
export type FavoritesOverflowEntry = { kind: 'favorite'; id: string } | { kind: 'folder'; id: string }

export interface NoteItem {
  id: string
  spaceId: SpaceId
  pageId: PageId | null
  pageTitle: string | null
  content: string
  createdAt: number
}

// ─── IA ──────────────────────────────────────────────────────────────────────

export type ApiProviderKind = 'anthropic' | 'openai' | 'xai'
export type ProviderKind = 'ollama' | ApiProviderKind

export interface AiStatus {
  ollama: { reachable: boolean; baseUrl: string; models: string[] }
  configured: Record<ApiProviderKind, boolean>
  /** Provider effectivement retenu après résolution (mode auto inclus). */
  active: ProviderKind | 'none'
  activeModel: string | null
  embeddings: 'ollama' | 'openai' | 'none'
  /** Usage du jour vs plafond configuré (`AppSettings.aiCloudDailyLimit`) —
   * `limit: 0` = illimité, `count` toujours suivi même dans ce cas (affichage
   * informatif seulement). */
  cloudBudget: { count: number; limit: number }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MuseContext {
  spaceName: string
  page?: { title: string; url: string; excerpt: string }
  selection?: { title: string; url: string }
}

export interface ChatRequest {
  requestId: string
  messages: ChatMessage[]
  context: MuseContext | null
}

export interface ChatChunk {
  requestId: string
  delta: string
}

export interface ChatDone {
  requestId: string
  error: string | null
  providerUsed: ProviderKind | null
}

// ─── Intention ───────────────────────────────────────────────────────────────

export type IntentKind = 'url' | 'search' | 'intent'

export type IntentPlan =
  | { kind: 'compare'; left: string; right: string }
  | { kind: 'ask' }
  | { kind: 'search-and-ask' }

export interface IntentResult {
  input: string
  type: IntentKind
  /** URL normalisée si type === 'url'. */
  url?: string
  /** Requête de recherche si type === 'search' (ou repli d'une intention). */
  query?: string
  plan?: IntentPlan
  source: 'heuristic' | 'ai'
}

// ─── Réglages ────────────────────────────────────────────────────────────────

export type SearchEngineId = 'duckduckgo' | 'google' | 'brave' | 'bing' | 'ecosia' | 'startpage'

/** Couleur d'accent prédéfinie de l'interface (Apparence). '' = utiliser accentCustom. */
export type AccentId = 'glacier' | 'lavande' | 'emeraude' | 'ambre' | 'rose' | 'custom'

/** Thème visuel de l'interface ÆTHER. */
export type ThemeMode = 'dark' | 'light' | 'system'

/** Mode proxy (Système). */
export type ProxyMode = 'system' | 'direct' | 'custom'

/** Position des outils de développement d'une page. `'left'|'right'|'bottom'`
 * sont ancrés dans la fenêtre ÆTHER elle-même (`WebContents.setDevToolsWebContents`,
 * pas le simple `openDevTools({mode})` — sans effet pour une page attachée en
 * `WebContentsView`), `'detach'` reste une vraie fenêtre séparée (gérée par
 * Electron). */
export type DevtoolsDockMode = 'detach' | 'left' | 'right' | 'bottom'

/** Un moteur de recherche ajouté par l'utilisateur. */
export interface CustomSearchEngine {
  id: string
  label: string
  /** URL avec %s comme emplacement de la requête. */
  url: string
  createdAt: number
}

/** Un raccourci de site sur la page de nouvel onglet (façon Chrome/Brave) — éditable, indépendant des favoris. */
export interface NewTabShortcut {
  id: string
  title: string
  url: string
}

/** Widgets activables sur la page de nouvel onglet. */
export interface NewTabWidgets {
  clock: boolean
  weather: boolean
  news: boolean
}

/** Résultat météo courant (widget nouvel onglet) — géolocalisation par IP, aucune clé requise. */
export interface NewTabWeather {
  city: string
  /** Région/état — vide si inconnue. */
  region: string
  /** Pays — vide si inconnu. */
  country: string
  tempC: number
  /** Code météo WMO (open-meteo) — mappé côté renderer vers une icône/un libellé. */
  code: number
  /** Température ressentie (°C) — null si non fournie par l'API. */
  feelsLikeC: number | null
  /** Humidité relative (%). */
  humidity: number | null
  /** Vitesse du vent (km/h). */
  windKph: number | null
  /** Indice UV courant. */
  uvIndex: number | null
  /** Heure de lever du soleil, format "HH:mm" (heure locale du lieu). */
  sunrise: string | null
  /** Heure de coucher du soleil, format "HH:mm". */
  sunset: string | null
}

/** Style d'affichage du widget actualités : texte seul (plus d'articles) ou 3 gros articles illustrés. */
export type NewTabNewsStyle = 'text' | 'photos'

/** Ville choisie manuellement pour le widget météo (coordonnées déjà résolues —
 * évite toute ambiguïté de re-géocodage entre deux villes homonymes). */
export interface NewTabWeatherLocation {
  name: string
  admin1: string
  country: string
  lat: number
  lon: number
}

/** Suggestion d'autocomplétion pour le choix d'une ville (widget météo). */
export interface NewTabCitySuggestion {
  name: string
  admin1: string
  country: string
  lat: number
  lon: number
  /** Libellé affiché, désambiguïsé (« Lyon, Auvergne-Rhône-Alpes, France »). */
  label: string
}

/** Article d'actualité (widget nouvel onglet). */
export interface NewTabNewsItem {
  title: string
  url: string
  /** null si l'article n'a pas d'image dans le flux — repli automatique en mode texte. */
  imageUrl: string | null
}

export interface AppSettings {
  aiProvider: 'auto' | ProviderKind
  ollamaBaseUrl: string
  /** '' = premier modèle disponible, choisi automatiquement. */
  ollamaModel: string
  ollamaEmbedModel: string
  anthropicModel: string
  openaiModel: string
  xaiModel: string
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
  hasXaiKey: boolean
  /** Plafond quotidien d'appels IA cloud (Anthropic/OpenAI/xAI) — Ollama non
   * concerné (local, gratuit). 0 = illimité. Protège d'une facture surprise
   * en cas de boucle/bug qui martèle l'API ; remis à zéro chaque jour. */
  aiCloudDailyLimit: number
  /** Relais SMTP configuré (développeur uniquement, jamais via une UI
   * Réglages) — permet à l'overlay « Signaler un problème » de proposer un
   * repli `mailto:` si l'envoi automatique n'est pas disponible. */
  hasSmtpConfig: boolean
  /** Id d'un moteur intégré (SearchEngineId) ou d'un CustomSearchEngine. */
  searchEngine: string
  // — Apparence —
  theme: ThemeMode
  accent: AccentId
  /** Couleur hexadécimale personnalisée, utilisée quand accent === 'custom'. */
  accentCustom: string
  /** Fond d'écran de l'appli — `'preset'` référence un dégradé intégré (id
   * dans BACKGROUND_PRESETS, renderer), `'custom'` un fichier importé (nom
   * stocké dans le même dossier géré que les avatars, servi via
   * `aether://avatars/<fichier>`). */
  backgroundImage: { kind: 'preset' | 'custom'; value: string } | null
  /** Barre de favoris sous la barre de titre. */
  showFavoritesBar: boolean
  /** Regrouper les favoris par espace (pastille de couleur) dans la barre. */
  groupFavoritesBySpace: boolean
  /** La pilule d'intention s'étire sur toute la largeur disponible. */
  wideAddressBar: boolean
  /** Bande de vignettes des pages de l'espace courant, façon onglets, en mode Focus. */
  showPageStrip: boolean
  /** Aperçu agrandi (JPEG) au survol d'une page dans la bande — sinon, infobulle texte seule. */
  showTabHoverPreview: boolean
  /** Échelle des textes/éléments de l'interface ÆTHER elle-même (1 = 100 %) —
   * distinct de `defaultZoom`, qui ne s'applique qu'au contenu des pages web. */
  uiScale: number
  /** Panneau Constellation (espaces) visible au démarrage de l'app. */
  showConstellationOnLaunch: boolean
  /** Panneau Muse visible au démarrage de l'app. */
  showMuseOnLaunch: boolean
  // — Navigation —
  /** Choix EXCLUSIF au démarrage — 'newtab' : toujours une page de nouvel onglet
   * fraîche ; 'restore' : la page qui était au premier plan par espace à la
   * fermeture précédente (repli sur 'newtab' si un espace n'a rien à restaurer). */
  startupTabs: 'newtab' | 'restore'
  /** Page d'accueil ouverte par l'action « accueil » / nouvel espace vide. */
  homepage: string
  /** URL ouverte par le bouton « + » (nouvel onglet) — vide = page de nouvel
   * onglet intégrée (`aether://newtab`, widgets façon Brave/Chrome). */
  newTabUrl: string
  /** Raccourcis de la page de nouvel onglet intégrée — éditables, indépendants des favoris. */
  newTabShortcuts: NewTabShortcut[]
  /** Visites masquées du menu « récents » du champ de recherche (croix sur une
   * ligne) — DISSOCIÉ de l'historique de navigation réel : ne supprime rien
   * de `visits`, filtre juste l'affichage de ce menu précis. */
  newTabHiddenRecentIds: string[]
  /** Nombre d'emplacements de la grille de raccourcis (remplis + vides). */
  newTabGridSize: number
  /** Widgets activés sur la page de nouvel onglet intégrée. */
  newTabWidgets: NewTabWidgets
  /** Ville fixe pour le widget météo — null = géolocalisation automatique par IP. */
  newTabWeatherLocation: NewTabWeatherLocation | null
  /** Style d'affichage du widget actualités. */
  newTabNewsStyle: NewTabNewsStyle
  /** Facteur de zoom par défaut des pages web (1 = 100 %). */
  defaultZoom: number
  // — Confidentialité & sécurité —
  /** Caméra & micro (getUserMedia). */
  allowMedia: boolean
  allowGeolocation: boolean
  allowNotifications: boolean
  // — Blocage de contenu par origine (réglages globaux, `contentBlocking.ts`) —
  allowCookies: boolean
  blockImages: boolean
  /** Ne bloque que les `<script src>` EXTERNES — pas de bascule Electron pour
   * désactiver le JS inline dynamiquement par origine, voir `contentBlocking.ts`. */
  blockJavascript: boolean
  allowPopups: boolean
  allowAutoDownloads: boolean
  blockInsecureContent: boolean
  /** Envoyer l'en-tête « Do Not Track » (DNT: 1). */
  doNotTrack: boolean
  /** Tenter de forcer HTTPS en amont (mise à niveau http→https). */
  httpsOnly: boolean
  // — Performance —
  /** Nombre max de pages gardées en mémoire (économiseur de mémoire). */
  maxLivePages: number
  // — Langues —
  /** Correcteur orthographique dans les champs de saisie. */
  spellcheck: boolean
  /** Langues du correcteur (codes locale Chromium, ex. 'fr', 'en-US') — vide = détection système. */
  spellcheckLanguages: string[]
  /** Domaines où le bouton Traduire ne doit plus jamais s'afficher (« Ne jamais traduire ce site »). */
  neverTranslateDomains: string[]
  /** Langues source (codes ISO 639-1) traduites automatiquement à chaque
   * visite, sans repasser par le popup (« Toujours traduire les pages
   * rédigées en… », façon Chrome). */
  alwaysTranslateLanguages: string[]
  // — Système —
  proxyMode: ProxyMode
  /** Règles proxy si proxyMode === 'custom' (ex. « http=host:port »). */
  proxyRules: string
  /** Le bouton fermer de la fenêtre minimise au lieu de quitter (« Quitter ÆTHER » reste le vrai quitter). */
  minimizeOnClose: boolean
  /** Position des outils de développement d'une page (F12/Inspecter). */
  devtoolsDockMode: DevtoolsDockMode
  // — Téléchargements —
  /** Dossier de téléchargement ('' = Téléchargements par défaut de l'OS). */
  downloadDir: string
  /** Demander l'emplacement à chaque téléchargement. */
  askDownloadLocation: boolean
  // — Mises à jour —
  /** Vérifier (et télécharger) automatiquement au lancement — sinon, seule la
   * vérification manuelle (Réglages › À propos) fonctionne. */
  autoCheckForUpdates: boolean
  onboarded: boolean
}

/** Patch envoyé par le renderer ; les clés API transitent une fois puis sont chiffrées. */
export interface SettingsPatch {
  aiProvider?: AppSettings['aiProvider']
  ollamaBaseUrl?: string
  ollamaModel?: string
  ollamaEmbedModel?: string
  anthropicModel?: string
  openaiModel?: string
  xaiModel?: string
  /** null = effacer la clé enregistrée. */
  anthropicKey?: string | null
  openaiKey?: string | null
  xaiKey?: string | null
  aiCloudDailyLimit?: number
  searchEngine?: string
  theme?: ThemeMode
  accent?: AccentId
  accentCustom?: string
  backgroundImage?: { kind: 'preset' | 'custom'; value: string } | null
  showFavoritesBar?: boolean
  groupFavoritesBySpace?: boolean
  wideAddressBar?: boolean
  showPageStrip?: boolean
  showTabHoverPreview?: boolean
  uiScale?: number
  showConstellationOnLaunch?: boolean
  showMuseOnLaunch?: boolean
  startupTabs?: AppSettings['startupTabs']
  homepage?: string
  newTabUrl?: string
  newTabShortcuts?: NewTabShortcut[]
  newTabHiddenRecentIds?: string[]
  newTabGridSize?: number
  /** Fusionné avec les widgets déjà activés (patch partiel). */
  newTabWidgets?: Partial<NewTabWidgets>
  newTabWeatherLocation?: NewTabWeatherLocation | null
  newTabNewsStyle?: NewTabNewsStyle
  defaultZoom?: number
  allowMedia?: boolean
  allowGeolocation?: boolean
  allowNotifications?: boolean
  allowCookies?: boolean
  blockImages?: boolean
  blockJavascript?: boolean
  allowPopups?: boolean
  allowAutoDownloads?: boolean
  blockInsecureContent?: boolean
  doNotTrack?: boolean
  httpsOnly?: boolean
  maxLivePages?: number
  spellcheck?: boolean
  spellcheckLanguages?: string[]
  neverTranslateDomains?: string[]
  alwaysTranslateLanguages?: string[]
  proxyMode?: ProxyMode
  proxyRules?: string
  minimizeOnClose?: boolean
  devtoolsDockMode?: DevtoolsDockMode
  downloadDir?: string
  askDownloadLocation?: boolean
  autoCheckForUpdates?: boolean
  onboarded?: boolean
}

/** Catégories de données de navigation effaçables (façon Chrome). */
export type BrowsingDataKind = 'history' | 'cookies' | 'cache' | 'downloads'

/** Plage temporelle pour l'effacement des données (façon Chrome). */
export type ClearDataRange = 'hour' | 'day' | 'week' | 'month' | 'all'

/** Une entrée d'historique de navigation (distincte des pages persistantes de la Constellation). */
export interface Visit {
  id: string
  url: string
  title: string
  faviconUrl: string | null
  visitedAt: number
}

/** Une requête tapée dans la barre de recherche/la barre d'intention —
 * DISSOCIÉ de `Visit` (tout site visité, y compris via un lien cliqué) : le
 * menu « récents » du champ de recherche ne doit montrer que ce qui a été
 * vraiment cherché. */
export interface RecentSearch {
  id: string
  query: string
  searchedAt: number
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadEntry {
  id: string
  filename: string
  path: string
  url: string
  totalBytes: number
  receivedBytes: number
  state: DownloadState
  startedAt: number
  completedAt: number | null
  /** Le fichier existe-t-il encore sur le disque ? Toujours `true` hors état `completed`
   * (vérifié à la demande côté main — Electron ne fournit pas de veille automatique). */
  fileExists: boolean
}

export interface ExtensionInfo {
  id: string
  extensionId: string | null
  name: string
  description: string
  version: string
  /** Taille du dossier sur disque, en octets. */
  sizeBytes: number
  /** Libellés lisibles (français, au mieux) des permissions déclarées — pas les
   * identifiants bruts du manifest. */
  permissions: string[]
  /** 'webstore' si installée depuis le vrai Chrome Web Store, 'local' si chargée
   * manuellement (mode développeur, dossier choisi par l'utilisateur). */
  source: 'webstore' | 'local'
  /** URL de la fiche du Store — uniquement si `source === 'webstore'`. */
  storeUrl: string | null
  /** URL chrome-extension://… vers la page d'options déclarée par l'extension, si elle en a une. */
  optionsUrl: string | null
  /** URL chrome-extension://… vers la bulle (`action.default_popup`/`browser_action.default_popup`
   * du manifest) déclarée par l'extension, si elle en a une — sinon un clic sur l'icône
   * ne fait rien de plus que ce que montre déjà notre propre liste. */
  popupUrl: string | null
  path: string
  enabled: boolean
  iconUrl: string | null
  addedAt: number
}

/** Résultat d'une installation déclenchée depuis le vrai Chrome Web Store (bouton « Installer »). */
export interface ExtensionInstallResult {
  ok: boolean
  name: string | null
  alreadyInstalled: boolean
  error: string | null
}


/** Une langue de correcteur orthographique proposée (Réglages › Langues). */
export interface SpellcheckLanguage {
  /** Code locale Chromium (dictionnaire Hunspell embarqué). */
  code: string
  label: string
}

/** Principales langues du monde dont Chromium embarque un dictionnaire —
 * curées pour couvrir les langues les plus parlées, pas la liste complète. */
export const SPELLCHECK_LANGUAGES: SpellcheckLanguage[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en-US', label: 'Anglais (États-Unis)' },
  { code: 'en-GB', label: 'Anglais (Royaume-Uni)' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt-BR', label: 'Portugais (Brésil)' },
  { code: 'pt-PT', label: 'Portugais (Portugal)' },
  { code: 'ru', label: 'Russe' },
  { code: 'zh-CN', label: 'Chinois (simplifié)' },
  { code: 'ja', label: 'Japonais' },
  { code: 'ko', label: 'Coréen' },
  { code: 'ar', label: 'Arabe' },
  { code: 'hi', label: 'Hindi' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'pl', label: 'Polonais' },
  { code: 'tr', label: 'Turc' }
]

// ─── Sécurité de site ──────────────────────────────────────────────────────

/** `media` reste utilisé comme kind de REPLI pour `setPermissionCheckHandler`
 * (qui ne reçoit pas `details.mediaTypes`, donc ne peut pas distinguer
 * caméra/micro) et pour le réglage global (`allowMedia`) — mais les
 * SURCHARGES PAR SITE (popover, page de réglages) se posent sur `camera`/
 * `microphone` séparément, jamais sur `media` (voir `webSession.ts`).
 * `midi` couvre aussi la permission Electron `midiSysex` (une seule ligne
 * « Appareils MIDI » côté UI, pas deux). `clipboard`, `fileSystem`, `sound`
 * sont réels côté Electron (mêmes gestionnaires de permission, ou API dédiée
 * pour `sound`). `cookies`/`images`/`javascript`/`popups`/`autoDownloads`/
 * `insecureContent` sont appliqués par le moteur de blocage par origine
 * (`contentBlocking.ts`), pas par un gestionnaire de permission Electron —
 * mais partagent la MÊME table de surcharges (aucune raison technique de les
 * séparer, voir `sitePermissionsRepo`). USB/HID/Bluetooth/Ports série
 * (reportés à une session dédiée, nécessitent un sélecteur d'appareil)
 * s'ajouteraient ici de la même façon, sans changer la forme de cette table.
 * `media` est volontairement EXCLU de `UI_SITE_PERMISSION_KINDS` (repli
 * interne seulement, jamais affiché/réglable directement). */
export type SitePermissionKind =
  | 'media'
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'notifications'
  | 'midi'
  | 'clipboard'
  | 'fileSystem'
  | 'sound'
  | 'cookies'
  | 'images'
  | 'javascript'
  | 'popups'
  | 'autoDownloads'
  | 'insecureContent'

/** 14 des 15 catégories réellement affichées/réglables (popover, page de
 * réglages par site) — exclut `media` (repli interne uniquement). La 15ᵉ,
 * les niveaux de zoom, n'a PAS de kind ici : Chromium persiste déjà le zoom
 * par hôte nativement (`HostZoomMap`), aucune table de surcharge nécessaire —
 * gérée directement via `webContents.getZoomLevel/setZoomLevel` côté UI. */
export const UI_SITE_PERMISSION_KINDS: readonly SitePermissionKind[] = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'midi',
  'clipboard',
  'fileSystem',
  'sound',
  'cookies',
  'images',
  'javascript',
  'popups',
  'autoDownloads',
  'insecureContent'
]
/** 'ask' = pas de surcharge, suit le réglage global du profil. */
export type SitePermissionState = 'ask' | 'allow' | 'block'

export interface SiteInfo {
  origin: string
  isHttps: boolean
  permissions: Record<SitePermissionKind, SitePermissionState>
  /** Kinds que ce site a RÉELLEMENT utilisés au moins une fois (accordés, pas
   * seulement vérifiés) — pilote l'affichage conditionnel des lignes de
   * permission du popover (photo 1 : Micro affiché car utilisé ; photo 2 :
   * github.com, aucune ligne car rien n'a jamais été accordé). */
  usedKinds: SitePermissionKind[]
}

/** Principal X.509 (émetteur ou objet) — nom commun toujours présent,
 * organisation/unité facultatives (beaucoup de certificats DV n'en portent pas). */
export interface CertificatePrincipalDetail {
  commonName: string
  organization?: string
  organizationUnit?: string
}

/** Un maillon de la chaîne de certification, du certificat visité jusqu'à la
 * racine (voir `CertificateOverlay.tsx`, onglet Détails). */
export interface CertificateChainLink {
  commonName: string
  organization?: string
  isSelfSigned: boolean
}

/** Détail complet d'un certificat — calculé À LA DEMANDE (pas à chaque
 * poignée de main TLS, coûteux inutilement) quand l'utilisateur ouvre
 * `CertificateOverlay.tsx`. Champs absents plutôt que devinés quand
 * l'information n'est pas fiablement disponible sans parsing ASN.1 manuel
 * (ex. version X.509) — voir main/certificates.ts. */
export interface CertificateDetail {
  subject: CertificatePrincipalDetail
  issuer: CertificatePrincipalDetail
  serialNumber: string
  validStart: number
  validExpiry: number
  /** Empreinte SHA-256 du certificat (`crypto.X509Certificate.fingerprint256` de Node). */
  fingerprint: string
  /** Empreinte SHA-256 de la clé publique (technique SPKI, comme Chrome). */
  publicKeyFingerprint: string
  signatureAlgorithm?: string
  chain: CertificateChainLink[]
  /** PEM — pour le bouton « Exporter… ». */
  pem: string
}

/** Une ligne du panneau « Autorisations par site » (Réglages › Confidentialité). */
export interface SitePermissionOverride {
  origin: string
  kind: SitePermissionKind
  state: SitePermissionState
  updatedAt: number
}

/** Une origine exacte connue (via ses cookies, voir `siteDataRegistry.ts`) —
 * granularité de la ligne dépliée façon photo 7 (www.youtube.com,
 * accounts.youtube.com…). `usageBytes` vient de CDP `Storage.getUsageAndQuota`,
 * mis en cache 60s — 0 si indisponible plutôt qu'une valeur inventée. */
export interface SiteDataOrigin {
  origin: string
  usageBytes: number
  cookieCount: number
}

/** Regroupement par domaine « registrable » (photo 6 : la ligne « youtube.com »
 * avant dépliage) — heuristique simple deux-labels + petite liste de TLD
 * composés connus, PAS une vraie liste de suffixes publics (limite assumée). */
export interface SiteDataGroup {
  registrableDomain: string
  totalBytes: number
  totalCookies: number
  origins: SiteDataOrigin[]
}

/** Poussé par `permissionPromptWindow.ts` vers sa propre fenêtre native
 * (voir `PermissionPromptRoot.tsx`) — une demande de permission en attente. */
export interface PermissionPromptContent {
  requestId: string
  origin: string
  kind: SitePermissionKind
}

// ─── Popover flottant (fenêtre native) ─────────────────────────────────────

/** Rectangle écran (coordonnées absolues), comme `Electron.Rectangle`. */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** Rectangle de l'élément déclencheur, en coordonnées LOCALES à la fenêtre appelante. */
export interface LocalRect {
  x: number
  y: number
  width: number
  height: number
}

export type PopoverKind = 'site-info' | 'tab-preview' | 'translate' | 'favorites-folder' | 'app-menu' | 'context-menu'

/** Une entrée d'un menu contextuel générique (voir ContextMenuPopoverCard.tsx)
 * — remplace `Menu.buildFromTemplate` : purement des données sérialisables
 * (pas de `click` closures), l'action réelle reste dans une map côté main
 * (voir `showContextMenuPopover` dans popoverWindow.ts), retrouvée par `id`. */
export type ContextMenuRow =
  | { kind: 'separator' }
  | { kind: 'item'; id: string; label: string; accelerator?: string; checked?: boolean; disabled?: boolean; danger?: boolean }
  | { kind: 'submenu'; id: string; label: string; rows: ContextMenuRow[] }

/** Où ancrer un popup par rapport à son déclencheur (bouton) ou point d'ancrage
 * (clic droit) — 'below-left' place aussi le popup à droite/en dessous d'un
 * point précis quand `anchor.width`/`height` valent 0 (menu contextuel). */
export type PopoverPlacement = 'below-right' | 'below-center' | 'below-left'

/** Ce qu'affiche le popup — poussé par le main une fois la fenêtre prête.
 * `favorites-folder` porte un instantané (`folder`/`items`) déjà connu de
 * l'appelant (FavoritesBar.tsx a déjà ces données dans son propre store) —
 * évite d'attendre un aller-retour IPC avant le tout premier rendu, seule
 * source du délai perçu comme « trop long » par rapport aux autres popups
 * (qui n'ont rien à charger de façon asynchrone). */
export type PopoverContent =
  // `initialInfo` (optionnel) : même raison que `favorites-folder` ci-dessus —
  // `SiteInfoPopover.tsx` récupère déjà les infos par IPC AVANT d'ouvrir le
  // popup (voir `PopoverShowRequest`), donc plus besoin d'attendre un aller-
  // retour supplémentaire une fois affiché.
  | { kind: 'site-info'; pageId: PageId; initialInfo: SiteInfo | null }
  | { kind: 'tab-preview' | 'translate'; pageId: PageId }
  | { kind: 'favorites-folder'; folderId: string; folder: FavoriteFolder; items: Favorite[] }
  | { kind: 'app-menu' }
  | { kind: 'context-menu'; title?: string; rows: ContextMenuRow[] }
  | { kind: 'webstore-confirm'; extensionId: string; name: string; iconUrl: string | null }
  | { kind: 'extensions-menu' }
  | { kind: 'update-ready'; version: string }
  | null

/** Demande d'ouverture envoyée par la fenêtre principale. */
export type PopoverShowRequest =
  | {
      kind: 'site-info'
      pageId: PageId
      initialInfo: SiteInfo | null
      /** Rectangle du déclencheur (bouton, onglet…), coordonnées locales à la fenêtre principale. */
      anchor: LocalRect
      /** Où ancrer le popup par rapport au déclencheur. */
      placement: PopoverPlacement
    }
  | {
      kind: 'tab-preview' | 'translate'
      pageId: PageId
      anchor: LocalRect
      placement: PopoverPlacement
    }
  | {
      kind: 'favorites-folder'
      folderId: string
      folder: FavoriteFolder
      items: Favorite[]
      anchor: LocalRect
      placement: PopoverPlacement
    }
  | {
      kind: 'app-menu'
      anchor: LocalRect
      placement: PopoverPlacement
    }
  | {
      kind: 'extensions-menu'
      anchor: LocalRect
      placement: PopoverPlacement
    }
  | {
      kind: 'update-ready'
      version: string
      anchor: LocalRect
      placement: PopoverPlacement
    }

/** Une page interne Chromium réellement disponible dans Electron. */
export interface InternalPage {
  url: string
  label: string
  description: string
}

/** Un drapeau expérimental (façade « chrome://flags ») branché sur un vrai switch Chromium. */
export interface FlagDef {
  id: string
  label: string
  description: string
  default: boolean
  /** Prévenir que l'effet est fort/rare. */
  caution?: boolean
}

/** Drapeaux ÆTHER — sous-ensemble curé de switches Chromium/Electron réels. */
export const FLAG_DEFS: FlagDef[] = [
  {
    id: 'hardwareAcceleration',
    label: 'Accélération matérielle (GPU)',
    description: 'Utilise le GPU pour le rendu. Désactivez en cas de scintillement ou de bugs graphiques.',
    default: true
  },
  {
    id: 'forceDark',
    label: 'Forcer le thème sombre sur les sites',
    description: 'Assombrit automatiquement les pages web claires (équivalent « Auto Dark Mode »).',
    default: false
  },
  {
    id: 'experimentalWeb',
    label: 'Fonctionnalités web expérimentales',
    description: 'Active les API web en cours de standardisation. Peut rendre certains sites instables.',
    default: false,
    caution: true
  },
  {
    id: 'smoothScrolling',
    label: 'Défilement fluide',
    description: 'Animation douce du défilement des pages.',
    default: true
  },
  {
    id: 'overlayScrollbars',
    label: 'Barres de défilement fines',
    description: 'Barres de défilement discrètes en superposition, façon mobile.',
    default: false
  }
]

/** Pages `chrome://` que le moteur Chromium d'Electron sait afficher. */
export const CHROMIUM_INTERNAL_PAGES: InternalPage[] = [
  { url: 'chrome://gpu', label: 'GPU', description: 'Diagnostic graphique et accélération matérielle' },
  { url: 'chrome://media-internals', label: 'Média', description: 'Lecture audio/vidéo et pipelines média' },
  { url: 'chrome://webrtc-internals', label: 'WebRTC', description: 'Sessions temps réel (visio, P2P)' },
  { url: 'chrome://serviceworker-internals', label: 'Service workers', description: 'Workers hors-ligne enregistrés' },
  { url: 'chrome://blob-internals', label: 'Blobs', description: 'Stockage binaire en mémoire' },
  { url: 'chrome://histograms', label: 'Histogrammes', description: 'Métriques internes du moteur' },
  { url: 'chrome://accessibility', label: 'Accessibilité', description: "Arbre d'accessibilité des pages" }
]

/** Statut d'une URL chrome:// dans ÆTHER. */
export type ChromeUrlStatus =
  | 'aether' // routée vers une page ÆTHER (réglages, guide, flags…)
  | 'engine' // vraie page de diagnostic du moteur Chromium
  | 'unavailable' // propriétaire Chrome, sans équivalent

export interface ChromeUrlEntry {
  url: string
  status: ChromeUrlStatus
  note: string
}

/**
 * Annuaire des URLs `chrome://` (l'équivalent de `chrome://chrome-urls`),
 * affiché dans Paramètres › À propos. Documente ce que chaque URL fait ici.
 */
export const CHROME_URLS: ChromeUrlEntry[] = [
  { url: 'chrome://settings', status: 'aether', note: 'Ouvre les Paramètres ÆTHER' },
  { url: 'chrome://flags', status: 'aether', note: 'Ouvre Performance (drapeaux moteur)' },
  { url: 'chrome://version', status: 'aether', note: 'Paramètres › À propos' },
  { url: 'chrome://about', status: 'aether', note: 'Cet annuaire' },
  { url: 'chrome://chrome-urls', status: 'aether', note: 'Cet annuaire' },
  { url: 'chrome://downloads', status: 'aether', note: 'Ouvre le gestionnaire de téléchargements' },
  { url: 'chrome://history', status: 'aether', note: 'Ouvre l’historique (Données)' },
  { url: 'chrome://bookmarks', status: 'unavailable', note: 'Remplacé par les favoris & la toile' },
  { url: 'chrome://extensions', status: 'aether', note: 'Ouvre le gestionnaire d’extensions' },
  { url: 'chrome://password-manager', status: 'aether', note: 'Renvoyé vers Confidentialité (gestion via l’OS)' },
  { url: 'chrome://gpu', status: 'engine', note: 'Diagnostic graphique' },
  { url: 'chrome://media-internals', status: 'engine', note: 'Pipelines média' },
  { url: 'chrome://webrtc-internals', status: 'engine', note: 'Sessions temps réel' },
  { url: 'chrome://serviceworker-internals', status: 'engine', note: 'Service workers' },
  { url: 'chrome://blob-internals', status: 'engine', note: 'Stockage binaire' },
  { url: 'chrome://histograms', status: 'engine', note: 'Métriques du moteur' },
  { url: 'chrome://accessibility', status: 'engine', note: 'Arbre d’accessibilité' },
  { url: 'chrome://net-export', status: 'engine', note: 'Journal réseau' },
  { url: 'chrome://process-internals', status: 'engine', note: 'Processus & frames' },
  { url: 'chrome://tracing', status: 'engine', note: 'Traçage des performances' },
  { url: 'chrome://flags (Google)', status: 'unavailable', note: 'La page Google d’origine n’existe pas dans le moteur' }
]

// ─── Divers ──────────────────────────────────────────────────────────────────

/** Lien d'affinité sémantique entre deux pages (cosinus des embeddings). */
export interface AffinityLink {
  a: PageId
  b: PageId
  score: number
}

export interface OpenPageOptions {
  url: string
  spaceId: SpaceId
  parentId?: PageId | null
  /** Position souhaitée sur la toile (sinon placement automatique). */
  canvasPos?: { x: number; y: number } | null
}

export interface PageContext {
  title: string
  url: string
  excerpt: string
}

/** Contenu d'un profil : rechargé tel quel lors d'un changement de profil. */
export interface Workspace {
  spaces: Space[]
  pages: PageMeta[]
  notes: NoteItem[]
  favorites: Favorite[]
  favoriteFolders: FavoriteFolder[]
  activeSpaceId: SpaceId
  /** État Focus persisté par espace — consulté seulement si `startupTabs === 'restore'`. */
  focusBySpace: Record<SpaceId, FocusState>
}

/** Versions affichées dans Paramètres › À propos (façon chrome://version). */
export interface AppVersions {
  app: string
  electron: string
  chromium: string
  node: string
  v8: string
}

export interface InitialState extends Workspace {
  profiles: Profile[]
  activeProfileId: ProfileId
  settings: AppSettings
  aiStatus: AiStatus
  versions: AppVersions
}

/** État de la vérification/mise à jour ÆTHER (Réglages › À propos), pilotée par
 * `electron-updater` côté main (main/updater.ts) — GitHub Releases comme source,
 * gratuit et sans jeton nécessaire côté app distribuée (dépôt public). */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; checkedAt: number }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  /** `npm run dev`/build non empaqueté — electron-updater ne fonctionne que dans un vrai paquet installé. */
  | { state: 'dev-mode' }

/** Commandes clavier globales, relayées par le main quand une page a le focus. */
export type ShortcutCommand =
  | 'intention'
  | 'toggle-mode'
  | 'toggle-constellation'
  | 'toggle-muse'
  | 'close-page'
  | 'settings'
  | 'guide'
  | 'downloads'
  | 'private-window'
  | 'new-window'
  | 'report-problem'
  | 'fullscreen'
  | 'history'
  | 'favorites-manage'
  | 'devtools'
  | 'print'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'clear-data'
  | 'extensions'
  | 'find-in-page'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'save-page'
  | 'screenshot'
  | 'copy-link'
  | 'qr-code'
  | 'tab-search'
  | 'task-manager'
  | 'rename-window'
  | 'customize-theme'
  | 'performance-settings'
  | 'about'
  | 'translate-page'
