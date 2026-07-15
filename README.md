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
| `npm run gen:icon`  | (Re)génère l'icône d'app (`build/icon.png` + `.ico`) |
| `npm run dist`      | Installateur Windows NSIS (`release/`)             |
| `npm run rebuild`   | Recompile les modules natifs pour Electron         |

Le versionnage suit SemVer ; chaque évolution est consignée dans [CHANGELOG.md](CHANGELOG.md).

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
