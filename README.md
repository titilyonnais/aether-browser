# ÆTHER

**Un espace de pensée et d'action augmenté pour le web.**

ÆTHER est un navigateur desktop pour Windows 11 (Electron/Chromium) qui abandonne le
paradigme des onglets. On y exprime des **intentions**, on arrange des **cartes** sur une
**toile spatiale**, dans des **espaces** calmes — accompagné par **Muse**, un compagnon IA
hybride (local d'abord, API ensuite) qui comprend le contexte.

---

## Démarrage

```bash
npm install        # installe les dépendances + recompile better-sqlite3 pour Electron
npm run dev        # lance ÆTHER en développement (HMR)
```

> **Note npm ≥ 11.15** : si l'installation affiche des avertissements `allow-scripts` et
> que le binaire Electron manque (`node_modules/electron/dist/electron.exe`), exécutez :
> `node node_modules/electron/install.js`

### Scripts

| Commande            | Effet                                              |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Développement avec rechargement à chaud            |
| `npm run build`     | Build de production (`out/`)                       |
| `npm run typecheck` | Vérification TypeScript stricte (main + renderer)  |
| `npm test`          | Suite de tests (Vitest) — voir [CONTRIBUTING.md](CONTRIBUTING.md) |
| `npm run gen:icon`  | (Re)génère l'icône d'app (`build/icon.png` + `.ico`) |
| `npm run dist`      | Installateur Windows NSIS (`release/`)             |
| `npm run release`   | Build + publie une release GitHub (mises à jour auto) |
| `npm run rebuild`   | Recompile les modules natifs pour Electron         |

Le versionnage suit SemVer ; chaque évolution est consignée dans [CHANGELOG.md](CHANGELOG.md).

### Mises à jour automatiques

ÆTHER vérifie silencieusement les mises à jour au lancement (et sur demande dans
Réglages › À propos), télécharge en arrière-plan, puis propose de redémarrer pour
installer — via [`electron-updater`](https://www.electron.build/auto-update) sur les
[GitHub Releases](https://github.com/titilyonnais/aether-browser/releases) de ce
dépôt (public : l'app distribuée ne contient aucun jeton, seule la publication en
nécessite un).

**Publication automatique** : un workflow GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)) build et publie
tout seul une release dès que `version` change dans `package.json` sur `main` — il
suffit de committer/pousser normalement (bump version + entrée `CHANGELOG.md`), rien
d'autre à faire. Gratuit (Actions illimité sur dépôt public) et sans jeton à gérer
(`GITHUB_TOKEN`, fourni automatiquement par GitHub Actions, scope limité à ce dépôt).

Publication manuelle possible aussi, depuis un poste de développement :
1. Créer un [jeton d'accès personnel GitHub](https://github.com/settings/tokens) avec le
   scope `public_repo` (ou un jeton fin avec `Contents: Read and write` sur ce dépôt).
2. `$env:GH_TOKEN = "<le jeton>"` (PowerShell, pour la session courante uniquement).
3. `npm run release` — build, crée la release GitHub et y publie l'installeur + le
   manifeste de mise à jour.

Les postes déjà installés détecteront la nouvelle version au prochain lancement (ou
immédiatement via « Rechercher les mises à jour »). L'installeur utilise toujours le
même emplacement (`allowToChangeInstallationDirectory: false`) — indispensable pour
qu'une mise à jour se pose par-dessus l'installation existante au lieu d'en créer une
seconde à côté.

### Signature (SmartScreen)

L'installeur et l'exécutable ne sont **pas signés** actuellement : Windows affiche
« Microsoft Defender SmartScreen a empêché le démarrage d'une application non
reconnue » au premier lancement. C'est attendu, pas un bug — Windows n'a aucun moyen
de vérifier qui a produit le binaire tant qu'aucun certificat de signature de code
reconnu ne l'accompagne, et la réputation SmartScreen (build automatique au fil des
téléchargements/exécutions sans signalement) ne s'accumule que pour un binaire déjà
signé de façon cohérente.

**Un certificat auto-signé ne règle PAS ce problème pour une distribution publique** :
il n'est présent dans le magasin « Autorités de confiance » d'aucune machine tant que
l'utilisateur ne l'y importe pas manuellement lui-même — impossible à grande échelle
via GitHub Releases. Il reste utile pour un usage strictement interne/dev (machines où
le certificat est déjà importé, ou simplement pour renseigner un éditeur dans les
propriétés du fichier). Génération (PowerShell, en administrateur) :

```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Aether Dev" `
  -KeyUsage DigitalSignature `
  -FriendlyName "Aether Code Signing (dev, auto-signé)" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(3) `
  -KeyExportPolicy Exportable `
  -KeyLength 2048 `
  -KeyAlgorithm RSA `
  -HashAlgorithm SHA256

$pwd = ConvertTo-SecureString -String "change-moi" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\build\aether-dev-signing.pfx" -Password $pwd
```

Puis, pour signer un build (`electron-builder.yml` ne contient aucun chemin de
certificat — `CSC_LINK`/`CSC_KEY_PASSWORD` sont détectées automatiquement) :

```powershell
$env:CSC_LINK = "C:\chemin\vers\aether-dev-signing.pfx"
$env:CSC_KEY_PASSWORD = "change-moi"
npm run dist
```

electron-builder horodate automatiquement la signature (RFC 3161, serveur public) dès
qu'un certificat est fourni — aucun réglage supplémentaire. **Ne jamais committer le
`.pfx`** (`*.pfx`/`*.p12` sont dans `.gitignore`) : il embarque la clé privée.

La seule voie **gratuite et réellement efficace** contre SmartScreen pour une
distribution publique est [SignPath.io Foundation](https://signpath.org/) — certificats
de signature de code gratuits pour les projets open source éligibles (licence OSI,
dépôt public, CI active) : ÆTHER remplit ces critères (MIT, dépôt public, workflow CI),
mais la candidature et l'intégration au pipeline de signature restent à faire par
quelqu'un ayant autorité sur le dépôt — non automatisable depuis ici.

## Chromium, pas Chrome

ÆTHER utilise le **moteur** Chromium (rendu Blink, V8, réseau, sandbox) via Electron — d'où
une compatibilité web identique à Chrome. Mais ce n'est pas le **produit** Google Chrome :
`chrome://flags`, `chrome://settings`, la synchronisation Google ou le Web Store sont
propriétaires et absents du moteur.

ÆTHER en fournit donc l'équivalent, et **route les URLs familières** vers ses propres pages :

- `chrome://settings` (et sous-pages : `/privacy`, `/downloads`, `/search`, `/extensions`…) →
  ouvre les **Paramètres** ÆTHER, sur la bonne section.
- `chrome://flags` → **Paramètres › Performance**, où vivent les drapeaux moteur (accélération
  GPU, fonctions expérimentales…) — de vrais switches Chromium, appliqués au redémarrage.
- `chrome://downloads` → le gestionnaire de téléchargements. `chrome://extensions` → le
  gestionnaire d'extensions.
- Les diagnostics réels du moteur fonctionnent tels quels : `chrome://gpu`,
  `chrome://media-internals`, `chrome://webrtc-internals`, etc.

L'annuaire complet des URLs `chrome://` (l'équivalent de `chrome://chrome-urls`) est listé dans
**Paramètres › À propos**, avec le statut de chacune (page ÆTHER / diagnostic moteur / indispo.).

## Paramètres

Organisés comme Chrome / Edge / Brave, en 13 sections : **Intelligence** (IA), **Profils**
(avatars), **Apparence** (thème clair/sombre/système, accents, barre de favoris, bande de
pages), **Navigation** (accueil, téléchargements), **Recherche** (moteurs personnalisés),
**Confidentialité & sécurité** (permissions, Do Not Track, HTTPS d'abord), **Performance**
(économiseur de mémoire, drapeaux moteur), **Langues** (correcteur), **Système** (navigateur
par défaut, proxy), **Données** (suppression par plage temporelle et catégorie),
**Extensions** (mode développeur), **Réinitialiser**, **À propos**.

## Fonctionnalités façon Chrome, à la manière ÆTHER

- **Bande de pages** (Apparence, désactivée par défaut) : la traduction ÆTHER-native des
  onglets — une rangée de vignettes des pages de l'espace courant en mode Focus. Clic pour
  charger en Focus, **clic milieu** pour fermer, **clic prolongé + glisser** pour réordonner,
  **clic droit** pour un menu contextuel complet (nouvel onglet, couper le son, favoris,
  fermer les autres/à droite, rouvrir le dernier fermé). Le survol affiche, après un court
  délai, un aperçu de la page (optionnel) et sa **mémoire utilisée**. Choisi plutôt qu'une
  barre d'onglets classique, qui contredirait le paradigme sans onglets du projet — mais si
  vous préférez une barre d'onglets littérale, dites-le.
- **Informations de site** : l'icône cadenas/globe dans l'en-tête de chaque page ouvre un
  popover façon Chrome — état HTTPS/HTTP, **certificat observé** en direct (émetteur, sujet,
  validité, empreinte ; ÆTHER capture passivement, elle ne décide jamais elle-même de la
  confiance à accorder), et les **autorisations du site** (caméra/micro, localisation,
  notifications) avec surcharge par origine et par profil.
- **Barre de favoris** (Apparence) : pages épinglées via l'étoile de l'en-tête (mode Focus),
  regroupables par espace.
- **Plein écran** : une page qui demande le plein écran HTML5 (lecteur vidéo…) masque toute
  l'interface ÆTHER et occupe l'écran en entier, barre des tâches Windows comprise — comme
  un vrai navigateur, pas seulement sa zone de contenu. `F11` fait de même à la demande, pour
  toute la fenêtre, indépendamment d'une vidéo.
- **Espaces personnalisables** (Constellation) : clic droit sur un espace pour le renommer,
  changer sa couleur (8 teintes), le dupliquer ou le dissoudre ; clic molette = duplication
  rapide.
- **Historique** : table dédiée, distincte des pages persistantes de la Constellation,
  alimentant l'autocomplétion de la Barre d'Intention et la suppression par plage.
- **Téléchargements** : suivi complet avec progression en direct (bouton + pastille d'activité
  dans la barre de titre, panneau détaillé).
- **Extensions** : chargement en mode développeur (dossier avec `manifest.json`), la méthode
  qu'utilisent tous les navigateurs Chromium en coulisses — Chrome Web Store bloque
  l'installation directe depuis tout navigateur qui n'est pas Chrome, y compris Edge et Brave.
- **Navigation privée** (`Ctrl+Maj+N`) : profil éphémère à session en mémoire, aucune trace au-delà
  de sa fermeture, aucun historique journalisé.

## Profils

Comme Chrome, ÆTHER gère plusieurs **profils** (avatar en haut à droite). Chaque profil a sa
**session isolée** — cookies, connexions, cache et espaces de travail entièrement séparés.
C'est ce qui permet d'être connecté à des comptes différents (Google, GitHub…) selon le
profil, sans qu'ils se mélangent.

> **Chrome Sync n'est pas disponible** — et ne peut l'être pour aucun navigateur tiers
> (Brave, Edge, Vivaldi non plus). C'est un service **fermé de Google**, réservé au Chrome
> officiel. La bonne pratique dans ÆTHER : connectez-vous à Google **dans les pages web** de
> chaque profil ; ces connexions restent cloisonnées par profil.

## L'intelligence hybride

Muse et la classification d'intention utilisent, dans l'ordre :

1. **Ollama en local** (défaut, détecté automatiquement sur `http://127.0.0.1:11434`)
   ```bash
   ollama pull llama3.2          # modèle de dialogue
   ollama pull nomic-embed-text  # embeddings → liens d'affinité dans la constellation
   ```
2. **APIs configurées** dans Paramètres → Intelligence : Claude (Anthropic), OpenAI, Grok (xAI).
   Les clés sont chiffrées au repos via `safeStorage` (DPAPI) et ne quittent jamais la machine.

Le mode « Automatique » choisit le local s'il est joignable, sinon la première API configurée,
avec repli transparent si un provider échoue avant le premier token.

## Gestes & raccourcis

| Geste                    | Action                                    |
| ------------------------ | ----------------------------------------- |
| `Ctrl K` / `Ctrl T`      | Barre d'Intention (URL, recherche, pensée)|
| `Ctrl E`                 | Basculer Focus ⟷ Toile spatiale           |
| `Ctrl B` / `Ctrl J`      | Constellation / Muse                      |
| `Ctrl W` · `Ctrl R`      | Fermer · recharger la page active         |
| `Alt ←` / `Alt →`        | Historique                                |
| `F1`                     | Guide (réouvrable à tout moment)          |
| `F11`                    | Plein écran natif (masque la barre des tâches) |
| Molette / `Ctrl` molette | Pan / zoom de la toile                    |
| Double-clic sur la toile | Nouvelle carte à cet endroit              |
| Double-clic sur une carte| Ouvrir en mode Focus                      |
| `⇧⏎` dans l'Intention    | Ouvrir en carte, sans quitter la toile    |

Dans la Barre d'Intention, essayez : `compare rust et zig`, `résume cette page`,
`comment fonctionne un transformeur ?` — la classification (heuristique + IA) route
vers la navigation, la recherche, une vue scindée ou Muse.

## Architecture

```
src/
├── main/                  # Processus principal (Node)
│   ├── index.ts           # Bootstrap, sécurité des sessions, single-instance
│   ├── mainWindow.ts      # Fenêtre frameless
│   ├── viewManager.ts     # ⭐ Orchestration des WebContentsView natives (LRU ≤ 6 vues)
│   ├── previews.ts        # Captures JPEG des pages (aperçus des cartes)
│   ├── protocol.ts        # Schéma aether:// qui sert les aperçus
│   ├── ipc.ts             # Tous les handlers IPC (surface validée)
│   ├── settings.ts        # Réglages + clés API chiffrées (safeStorage)
│   ├── db/                # SQLite (better-sqlite3) : espaces, pages, notes, embeddings
│   └── ai/                # Routeur hybride, providers streaming, intention, embeddings
├── preload/               # Pont contextBridge strict → window.aether
├── shared/                # Types, canaux IPC, heuristique d'intention (pur)
└── renderer/src/          # React 19 + Tailwind 4 + Framer Motion + Zustand
    ├── stores/            # ui · spaces · pages · muse · settings
    ├── lib/actions.ts     # Orchestration inter-stores (ouvrir, focus, Muse…)
    ├── hooks/             # useViewBounds (sync vues natives), useHotkeys
    └── components/        # chrome · constellation · focus · canvas · intention · muse …
```

### Le choix technique central : vues natives + aperçus

- **Mode Focus** : chaque page vit dans une `WebContentsView` native (sandbox, pas de
  `<webview>`), positionnée au pixel sous le rectangle que le renderer réserve
  (`useViewBounds` : une boucle rAF n'envoie un IPC que si le rectangle change — la vue
  suit les animations de panneaux et le redimensionnement du split sans décrocher).
- **Toile spatiale** : jamais de vue vivante. Les cartes affichent les **aperçus JPEG**
  capturés par le main (`capturePage` → redimensionné → servi via `aether://`), d'où une
  toile 100 % DOM : pan/zoom par `transform` GPU, 60 fps, mémoire maîtrisée.
- **Overlays** (Intention, Paramètres…) : le main masque les vues, l'aperçu prend le
  relais sous le flou — transitions sans couture.
- Une **LRU** décharge les pages au-delà de 6 vues vivantes ; les cartes restent
  (métadonnées + aperçu) et se réhydratent au clic.

### Sécurité

`sandbox` global, `contextIsolation` partout, `webviewTag` interdit, preload minimal typé,
permissions web réduites (fullscreen/pointerLock uniquement), popups convertis en cartes,
UA nettoyé, CSP stricte sur l'interface, clés API chiffrées DPAPI.

## Données

Tout est local, dans `%APPDATA%/aether-browser/` : base SQLite (`aether.db` — espaces,
pages, notes, embeddings, réglages) et aperçus (`previews/*.jpg`). Aucune télémétrie.
