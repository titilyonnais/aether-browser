/**
 * Ouverture et migration de la base SQLite locale (better-sqlite3).
 * Tout est stocké dans le dossier userData de l'application.
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS spaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  hue         INTEGER NOT NULL DEFAULT 210,
  position    INTEGER NOT NULL DEFAULT 0,
  canvas_x    REAL NOT NULL DEFAULT 0,
  canvas_y    REAL NOT NULL DEFAULT 0,
  canvas_zoom REAL NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id              TEXT PRIMARY KEY,
  space_id        TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  favicon_url     TEXT,
  parent_id       TEXT,
  canvas_x        REAL NOT NULL DEFAULT 0,
  canvas_y        REAL NOT NULL DEFAULT 0,
  canvas_w        REAL NOT NULL DEFAULT 360,
  canvas_h        REAL NOT NULL DEFAULT 260,
  preview_version INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  last_visited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pages_space ON pages(space_id);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  page_id    TEXT,
  page_title TEXT,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_space ON notes(space_id);

CREATE TABLE IF NOT EXISTS embeddings (
  ref_id     TEXT PRIMARY KEY,
  ref_type   TEXT NOT NULL,
  model      TEXT NOT NULL,
  dims       INTEGER NOT NULL,
  vector     BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export function openDatabase(): Database.Database {
  if (db) return db
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'aether.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Base de données non initialisée')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

/** Profils (v2) : sessions et espaces de travail cloisonnés, façon Chrome. */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  hue        INTEGER NOT NULL DEFAULT 210,
  emoji      TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
ALTER TABLE spaces ADD COLUMN profile_id TEXT;
CREATE INDEX IF NOT EXISTS idx_spaces_profile ON spaces(profile_id);
`

/**
 * v3 : avatars de profil, favoris, historique de navigation, téléchargements,
 * extensions et moteurs de recherche personnalisés.
 */
const SCHEMA_V3 = `
ALTER TABLE profiles ADD COLUMN avatar_kind TEXT NOT NULL DEFAULT 'icon';
ALTER TABLE profiles ADD COLUMN avatar_icon TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN avatar_image TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pages ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS visits (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  favicon_url TEXT,
  visited_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_profile ON visits(profile_id, visited_at);

CREATE TABLE IF NOT EXISTS downloads (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL,
  filename       TEXT NOT NULL,
  path           TEXT NOT NULL,
  url            TEXT NOT NULL DEFAULT '',
  total_bytes    INTEGER NOT NULL DEFAULT 0,
  received_bytes INTEGER NOT NULL DEFAULT 0,
  state          TEXT NOT NULL DEFAULT 'progressing',
  started_at     INTEGER NOT NULL,
  completed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_downloads_profile ON downloads(profile_id, started_at);

CREATE TABLE IF NOT EXISTS extensions (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  extension_id TEXT,
  name         TEXT NOT NULL DEFAULT '',
  path         TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  added_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extensions_profile ON extensions(profile_id);

CREATE TABLE IF NOT EXISTS search_engines (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`

/**
 * v4 : ordre des pages dans la bande de pages, sourdine par page, permissions
 * de site (surcharges par origine, façon Chrome).
 */
const SCHEMA_V4 = `
ALTER TABLE pages ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pages ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS site_permissions (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  origin     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  state      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(profile_id, origin, kind)
);
CREATE INDEX IF NOT EXISTS idx_site_permissions_lookup ON site_permissions(profile_id, origin);
`

/** v5 : dossiers de favoris (rangement, façon chrome://bookmarks) — cloisonnés
 * par profil, comme les espaces/pages/téléchargements/historique. */
const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS favorite_folders (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_favorite_folders_profile ON favorite_folders(profile_id);
ALTER TABLE pages ADD COLUMN favorite_folder_id TEXT;
`

/**
 * v6 : les favoris deviennent une entité à PART ENTIÈRE (façon signets
 * Chrome), plus un simple booléen sur une page. Un signet doit survivre à la
 * fermeture (donc à la suppression) de son onglet d'origine — impossible à
 * garantir tant qu'il vit sur la même ligne que la page. `pages.favorite` et
 * `pages.favorite_folder_id` (v3/v5) restent en base, orphelins et ignorés
 * du code applicatif : les supprimer demanderait un DROP COLUMN, risqué à
 * chaud sans bénéfice réel.
 */
const SCHEMA_V6 = `
CREATE TABLE IF NOT EXISTS favorites (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  favicon_url TEXT,
  space_id    TEXT,
  folder_id   TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id);
`

function migrate(database: Database.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number
  if (version < 1) {
    database.exec(SCHEMA_V1)
    database.pragma('user_version = 1')
  }
  if (version < 2) {
    // Migration non-destructive : les données existantes deviennent le profil « Par défaut ».
    database.exec(SCHEMA_V2)
    const defaultId = randomUUID()
    database
      .prepare(
        `INSERT INTO profiles (id, name, hue, emoji, position, created_at)
         VALUES (?, 'Par défaut', 210, '✦', 0, ?)`
      )
      .run(defaultId, Date.now())
    database.prepare('UPDATE spaces SET profile_id = ? WHERE profile_id IS NULL').run(defaultId)
    // Valeurs d'état stockées brutes (comme activeSpaceId), pas en JSON.
    database
      .prepare("INSERT INTO settings (key, value) VALUES ('state.activeProfileId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(defaultId)
    // Reporte l'espace actif global vers l'espace actif du profil par défaut.
    const prevActive = database
      .prepare("SELECT value FROM settings WHERE key = 'state.activeSpaceId'")
      .get() as { value: string } | undefined
    if (prevActive) {
      database
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(`state.activeSpaceId.${defaultId}`, prevActive.value)
    }
    database.pragma('user_version = 2')
  }
  if (version < 3) {
    database.exec(SCHEMA_V3)
    // Les profils existants gardent leur identité visuelle : emoji → icône d'avatar.
    database
      .prepare(
        "UPDATE profiles SET avatar_kind = 'icon', avatar_icon = emoji, avatar_color = '' WHERE avatar_kind = 'icon' AND avatar_icon = ''"
      )
      .run()
    database.pragma('user_version = 3')
  }
  if (version < 4) {
    database.exec(SCHEMA_V4)
    // Position initiale = ordre de création, par espace (bande de pages).
    const spaceIds = database.prepare('SELECT DISTINCT space_id FROM pages').all() as {
      space_id: string
    }[]
    const setPosition = database.prepare('UPDATE pages SET position = ? WHERE id = ?')
    for (const { space_id } of spaceIds) {
      const rows = database
        .prepare('SELECT id FROM pages WHERE space_id = ? ORDER BY created_at')
        .all(space_id) as { id: string }[]
      rows.forEach((row, i) => setPosition.run(i, row.id))
    }
    database.pragma('user_version = 4')
  }
  if (version < 5) {
    database.exec(SCHEMA_V5)
    database.pragma('user_version = 5')
  }
  if (version < 6) {
    database.exec(SCHEMA_V6)
    // Les favoris existants (pages.favorite = 1) deviennent des signets
    // indépendants, avec un nouvel id propre (pas celui de la page).
    const favoritedPages = database
      .prepare(
        `SELECT p.id, p.url, p.title, p.favicon_url, p.space_id, p.favorite_folder_id, p.created_at, s.profile_id
         FROM pages p JOIN spaces s ON p.space_id = s.id WHERE p.favorite = 1`
      )
      .all() as {
      url: string
      title: string
      favicon_url: string | null
      space_id: string
      favorite_folder_id: string | null
      created_at: number
      profile_id: string
    }[]
    const insertFavorite = database.prepare(
      `INSERT INTO favorites (id, profile_id, url, title, favicon_url, space_id, folder_id, position, created_at)
       VALUES (@id, @profile_id, @url, @title, @favicon_url, @space_id, @folder_id, @position, @created_at)`
    )
    favoritedPages.forEach((row, i) => {
      insertFavorite.run({
        id: randomUUID(),
        profile_id: row.profile_id,
        url: row.url,
        title: row.title,
        favicon_url: row.favicon_url,
        space_id: row.space_id,
        folder_id: row.favorite_folder_id,
        position: i,
        created_at: row.created_at
      })
    })
    database.pragma('user_version = 6')
  }
  if (version < 7) {
    // Nettoyage ponctuel : les toutes premières versions de la page de nouvel
    // onglet (`aether://newtab`) étaient enregistrées comme de vraies visites,
    // et certaines pages (tout schéma confondu) peuvent aussi émettre un
    // `did-stop-loading` fantôme pour leur commit initial (`about:blank`,
    // avant même le vrai `loadURL`) — URL et titre vides dans les deux cas.
    // Ça n'a jamais été voulu ; ces lignes polluaient les « récents » du champ
    // de recherche avec des entrées sans aucun texte. Cause corrigée côté
    // ViewManager/ipc.ts ; ceci purge les entrées déjà en base.
    database.exec("DELETE FROM visits WHERE url LIKE 'aether:%' OR url = '' OR url = 'about:blank'")
    database.pragma('user_version = 7')
  }
  if (version < 8) {
    // Reprise du nettoyage ci-dessus : la clause avait été élargie (schéma
    // `aether:`, url vide, `about:blank`) APRÈS que certaines bases soient
    // déjà passées par la migration 7 d'origine (qui ne visait que
    // `aether:%`) — repasser dessus explicitement pour ces bases-là aussi.
    database.exec("DELETE FROM visits WHERE url LIKE 'aether:%' OR url = '' OR url = 'about:blank'")
    // Doublons rapprochés dans le temps : une même navigation (redirections,
    // `history.pushState`…) pouvait déclencher plusieurs `did-stop-loading`
    // coup sur coup avant que la déduplication de `visitsRepo.record()` (v0.32.3)
    // n'existe — plusieurs lignes identiques (même profil+URL) à quelques
    // secondes d'écart pour une seule visite réelle. Ne garde que la plus
    // récente de chaque groupe rapproché (fenêtre de 60s).
    const rows = database
      .prepare('SELECT id, profile_id, url, visited_at FROM visits ORDER BY profile_id, url, visited_at')
      .all() as { id: string; profile_id: string; url: string; visited_at: number }[]
    const toDelete: string[] = []
    let prev: { profile_id: string; url: string; visited_at: number } | null = null
    for (const row of rows) {
      if (prev && prev.profile_id === row.profile_id && prev.url === row.url && row.visited_at - prev.visited_at < 60_000) {
        toDelete.push(row.id)
        // `prev` garde la borne du groupe telle quelle (pas mise à jour à
        // chaque doublon) : une rafale de courtes navigations vers la même
        // page reste comparée à son tout premier membre, pas au dernier
        // doublon rencontré — évite qu'une longue série de clics rapides
        // n'échappe à la fenêtre de 60s par glissements successifs.
        continue
      }
      prev = row
    }
    if (toDelete.length > 0) {
      const del = database.prepare('DELETE FROM visits WHERE id = ?')
      const tx = database.transaction((ids: string[]) => {
        for (const id of ids) del.run(id)
      })
      tx(toDelete)
    }
    database.pragma('user_version = 8')
  }
  if (version < 9) {
    // Table dédiée aux REQUÊTES tapées (barre de recherche/barre d'intention),
    // volontairement séparée de `visits` (tout site visité, y compris via un
    // lien cliqué) — le menu « récents » du champ de recherche ne doit montrer
    // QUE ce qu'on a vraiment cherché, jamais les pages simplement visitées.
    database.exec(`
CREATE TABLE IF NOT EXISTS search_queries (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  query        TEXT NOT NULL,
  searched_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_queries_profile ON search_queries(profile_id);
`)
    database.pragma('user_version = 9')
  }
}
