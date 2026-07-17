# Schéma de base de données — ÆTHER

Base SQLite locale (`better-sqlite3`), un seul fichier `aether.db` dans le
dossier `userData` de l'application. Journal en mode WAL, `synchronous =
NORMAL`, `foreign_keys = ON`. Toute la logique de migration vit dans
`src/main/db/database.ts` (fonction `migrate()`), déclenchée à chaque
`openDatabase()` via `PRAGMA user_version`.

## Tables

### `profiles`
Un profil = une identité cloisonnée (façon profils Chrome), avec sa propre
partition de session Electron (`webSession.ts`). `is_private` marque les
profils de navigation privée — leur partition est **en mémoire** (jamais
persistée sur disque), et le profil lui-même (lignes SQLite) est supprimé au
changement de profil, au démarrage et à `will-quit` (filet en cas de crash).

### `spaces`
Espaces de travail (façon fenêtres/groupes d'onglets), rattachés à un
`profile_id`. Porte sa propre caméra (`canvas_x/y/zoom`) pour la Toile
spatiale.

### `pages`
Une « carte » — l'équivalent d'un onglet, mais positionné librement sur la
Toile (`canvas_x/y/w/h`). `space_id REFERENCES spaces(id) ON DELETE CASCADE`
— supprimer un espace supprime déjà ses pages en cascade au niveau SQL.
Colonnes **orphelines** (voir Dette technique ci-dessous) : `favorite`,
`favorite_folder_id`.

### `notes`
Notes de Muse, rattachées à un espace (`ON DELETE CASCADE`) et optionnellement
à une page (`page_id`, sans contrainte FK — la page peut disparaître, la note
survit avec juste `page_title` comme trace).

### `embeddings`
Vecteurs d'embedding (page ou note), `ref_id` = id de la page/note ciblée,
`ref_type` = `'page' | 'note'`. **Pas de contrainte de clé étrangère** — le
code applicatif (`spacesRepo.remove`, `profilesRepo.remove`, `pagesRepo.remove`)
nettoie explicitement les embeddings correspondants avant de supprimer leur
référence, précisément parce que SQL ne le fait pas pour nous ici.

### `settings`
Clé/valeur brute — réglages applicatifs et quelques éléments d'état persistant
(`state.activeProfileId`, `state.activeSpaceId.<profileId>`).

### `visits`
Historique de navigation, par profil. `idx_visits_profile(profile_id,
visited_at)`. La recherche (`visitsRepo.search`) filtre par sous-chaîne
(`LIKE '%…%'`, aucun index ne peut accélérer un joker en tête) — bornée aux
3000 visites les plus récentes AVANT ce filtre pour un coût constant quelle
que soit la taille totale de l'historique (v0.45.2).

### `downloads`
Téléchargements par profil. `idx_downloads_profile(profile_id, started_at)`.

### `extensions`
Extensions chargées par profil (mode développeur uniquement — pas de vrai
Chrome Web Store packagé, voir `extensions.ts`).

### `search_engines`
Moteurs de recherche personnalisés (indépendants du profil).

### `site_permissions`
Surcharges de permission par origine (façon Chrome `chrome://settings/content`).
`UNIQUE(profile_id, origin, kind)`, `idx_site_permissions_lookup(profile_id, origin)`.

### `favorite_folders`
Dossiers de favoris, par profil.

### `favorites`
Signets — entité **indépendante** des pages depuis la v6 (avant, un simple
booléen `pages.favorite`) : un favori doit survivre à la fermeture de son
onglet d'origine. `idx_favorites_lookup(profile_id, url)` (v0.46.1) accélère
`findByUrl`/`removeByUrl` (égalité exacte, contrairement à la recherche
d'historique).

### `search_queries`
Requêtes tapées (barre de recherche/intention) — volontairement séparée de
`visits` : le menu « récents » du champ de recherche ne doit montrer QUE ce
qui a été cherché, jamais les pages simplement visitées via un lien cliqué.

## Historique des migrations (`user_version`)

| # | Contenu |
|---|---------|
| 1 | Schéma initial : `spaces`, `pages`, `notes`, `embeddings`, `settings` |
| 2 | `profiles` + `spaces.profile_id` (migration non destructive : tout devient le profil « Par défaut ») |
| 3 | Avatars de profil, `visits`, `downloads`, `extensions`, `search_engines`, `pages.favorite` (booléen, remplacé en v6) |
| 4 | `pages.position`/`pages.muted`, `site_permissions` |
| 5 | `favorite_folders`, `pages.favorite_folder_id` |
| 6 | `favorites` (entité indépendante) — migre les pages `favorite=1` existantes vers de vrais signets |
| 7 | Purge ponctuelle : visites `aether:`/vides/`about:blank` polluant les « récents » |
| 8 | Reprise de la purge v7 (bases déjà migrées avant l'élargissement de la clause) + dédoublonnage des visites rapprochées (<60s) |
| 9 | `search_queries` |
| 10 | `idx_favorites_lookup(profile_id, url)` |

## Dette technique connue

**`pages.favorite` et `pages.favorite_folder_id` sont orphelines** depuis la
migration v6 — plus jamais lues ni écrites par le code applicatif, mais
toujours présentes en base (SQLite ne supporte `DROP COLUMN` qu'en recréant
la table entière, jugé risqué à chaud pour un bénéfice de nettoyage pur —
décision documentée dans le commentaire de `SCHEMA_V6`, `database.ts`).
Choix assumé : ne pas y toucher plutôt que risquer une migration destructive
sans gain fonctionnel réel.
