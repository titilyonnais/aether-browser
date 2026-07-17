# Architecture — ÆTHER

Vue d'ensemble des décisions structurantes. Pour le détail des tables SQLite,
voir [SCHEMA.md](SCHEMA.md). Pour le processus de contribution, voir
[CONTRIBUTING.md](CONTRIBUTING.md).

## Trois processus, une frontière stricte

- **`src/main`** — process principal Electron (Node complet, accès disque/réseau/SQLite).
- **`src/renderer`** — interface React, `sandbox: true` + `contextIsolation: true`, aucun accès Node.
- **`src/preload`** — seul pont entre les deux, expose une API typée (`window.aether.*`, voir `src/shared/ipc.ts`) via `contextBridge`.

Le renderer ne fait **jamais** confiance à lui-même : tout payload complexe
qui traverse l'IPC est validé (`src/main/ipcSchemas.ts`, Zod) avant d'être
utilisé par le main. Un `ipcMain.on` (fire-and-forget) qui lève une exception
fait planter **tout le process principal** — d'où `safeValidate()` (ne lance
jamais) sur ces canaux, vs `.parse()` direct sur les `ipcMain.handle` (dont
l'exception devient une simple promesse rejetée côté renderer).

## Pourquoi `WebContentsView`, pas `<webview>`

Chaque page ouverte est une `WebContentsView` native (`ViewManager`,
`src/main/viewManager.ts`), positionnée par-dessus la fenêtre principale via
des bornes calculées côté renderer (`useViewBounds`) et transmises par IPC.
`<webview>` est **interdit globalement** (`will-attach-webview` intercepté
dans `index.ts`) — trop de limitations de sécurité/API documentées par
Electron lui-même.

Conséquence directe : une `WebContentsView` de contenu compose **toujours
au-dessus** de tout DOM de la fenêtre hôte, quel que soit le z-index. Tout
overlay (réglages, menus, popovers) doit donc soit masquer la vue
(`setVisible`/aperçu JPEG de secours), soit vivre dans une **fenêtre popup
native séparée** (`popoverWindow.ts`, `extensionPopupWindow.ts`) qui compose
par-dessus sans jamais toucher aux bornes de la page.

## LRU des vues vivantes

`ViewManager` ne garde qu'un nombre borné de `WebContentsView` réellement
vivantes (`maxLivePages`, réglage utilisateur) — au-delà, la moins récemment
utilisée et non visible est déchargée (`evictIfNeeded`), son aperçu JPEG
conservé pour un réaffichage instantané au retour. Une page évincée n'est
**pas fermée** : `pagesRepo` la garde, seule sa vue native est libérée
(`ensureLive` la recrée à la demande — chargement paresseux).

## Partitions de session

Chaque profil a sa propre partition Electron (`webSession.ts`,
`webPartitionForProfile`) : `persist:aether-web-<id>` pour un profil normal,
`aether-<id>` (sans `persist:`, **en mémoire**) pour un profil de navigation
privée — ses cookies/cache/localStorage ne touchent jamais le disque, quoi
qu'il arrive (crash inclus).

## Routeur IA hybride

`AiRouter` (`ai/router.ts`) essaie Ollama local en premier (mode « auto »),
puis les API configurées dans l'ordre `anthropic → openai → xai`. Le repli
entre candidats ne s'applique que si **aucun token n'a encore été émis**
(échec de connexion immédiat) — une fois le flux entamé, une coupure remonte
telle quelle plutôt que de rejouer la requête ailleurs (dupliquerait une
réponse partielle). Testé (`tests/ai-router.test.ts`).

## `aether://` — protocole custom

Sert des fichiers strictement internes (aperçus JPEG, avatars de profil) et
un document minimal pour `aether://newtab` — jamais de traversée de chemin
arbitraire (regex stricte sur le nom de fichier). `aether://newtab` est
**réellement chargé** dans sa `WebContentsView` (pas sauté) précisément pour
que le bouton retour puisse y revenir après une recherche (voir mémoire de
session / CHANGELOG v0.45.3) — le renderer masque cette vue derrière un
composant React (`NewTabPage.tsx`) mais elle reste vivante en dessous.

## Base de données

SQLite (`better-sqlite3`, synchrone) — voir [SCHEMA.md](SCHEMA.md). WAL +
`synchronous = NORMAL` (recommandation officielle SQLite pour ce mode).
Migrations séquentielles (`user_version`), jamais de rollback — chaque
migration est écrite pour être idempotente (`IF NOT EXISTS` partout) et sûre
à rejouer sur une base déjà à jour.

## Journal d'erreurs local

`src/main/logger.ts` — fichier texte local (`userData/logs/aether.log`,
rotation simple), **aucune télémétrie**. Branché sur les quelques repères où
un échec se dégradait auparavant en silence total (repli entre providers IA,
échec de chargement d'extension) — pas un ratissage systématique de tous les
`catch`, la plupart sont des échecs bénins/attendus qui ne méritent pas
d'entrée de log.
