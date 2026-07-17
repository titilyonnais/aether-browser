/**
 * Dépôts d'accès aux données. Chaque fonction est une opération SQL courte
 * et synchrone (better-sqlite3) — jamais exposée telle quelle au renderer.
 */
import { randomUUID } from 'node:crypto'
import type {
  AvatarKind,
  CanvasRect,
  CanvasView,
  DownloadEntry,
  DownloadState,
  ExtensionInfo,
  NoteItem,
  PageId,
  Profile,
  ProfileId,
  RecentSearch,
  Space,
  SpaceId,
  Visit
} from '@shared/types'
import { getDb } from './database'

// ─── Profils ─────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string
  name: string
  hue: number
  avatar_kind: AvatarKind
  avatar_icon: string
  avatar_color: string
  avatar_image: string
  is_private: number
  position: number
  created_at: number
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  name: r.name,
  hue: r.hue,
  avatarKind: r.avatar_kind,
  avatarIcon: r.avatar_icon,
  avatarColor: r.avatar_color,
  avatarImage: r.avatar_image,
  isPrivate: Boolean(r.is_private),
  position: r.position,
  createdAt: r.created_at
})

export const profilesRepo = {
  list(): Profile[] {
    const rows = getDb()
      .prepare('SELECT * FROM profiles ORDER BY position, created_at')
      .all() as ProfileRow[]
    return rows.map(toProfile)
  },

  get(id: ProfileId): Profile | undefined {
    const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | ProfileRow
      | undefined
    return row ? toProfile(row) : undefined
  },

  create(
    name: string,
    hue: number,
    avatar: { icon: string; color: string },
    opts: { isPrivate?: boolean } = {}
  ): Profile {
    const row: ProfileRow = {
      id: randomUUID(),
      name,
      hue,
      avatar_kind: 'icon',
      avatar_icon: avatar.icon,
      avatar_color: avatar.color,
      avatar_image: '',
      is_private: opts.isPrivate ? 1 : 0,
      position: (
        getDb().prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM profiles').get() as {
          p: number
        }
      ).p,
      created_at: Date.now()
    }
    getDb()
      .prepare(
        `INSERT INTO profiles (id, name, hue, avatar_kind, avatar_icon, avatar_color, avatar_image, is_private, position, created_at)
         VALUES (@id, @name, @hue, @avatar_kind, @avatar_icon, @avatar_color, @avatar_image, @is_private, @position, @created_at)`
      )
      .run(row)
    return toProfile(row)
  },

  rename(id: ProfileId, name: string): void {
    getDb().prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id)
  },

  setAvatar(
    id: ProfileId,
    avatar: { kind: AvatarKind; icon?: string; color?: string; image?: string }
  ): void {
    getDb()
      .prepare(
        `UPDATE profiles SET avatar_kind = ?, avatar_icon = ?, avatar_color = ?, avatar_image = ? WHERE id = ?`
      )
      .run(avatar.kind, avatar.icon ?? '', avatar.color ?? '', avatar.image ?? '', id)
  },

  remove(id: ProfileId): void {
    const db = getDb()
    // Les espaces (et par cascade pages/notes) du profil disparaissent avec lui
    // — mais `embeddings.ref_id` n'a aucune contrainte de clé étrangère (voir
    // le même commentaire dans `spacesRepo.remove`), donc rien ne les efface
    // par cascade : nettoyage explicite AVANT que les pages/notes ne disparaissent.
    const refs = db
      .prepare(
        `SELECT p.id FROM pages p JOIN spaces s ON p.space_id = s.id WHERE s.profile_id = ?
         UNION ALL
         SELECT n.id FROM notes n JOIN spaces s ON n.space_id = s.id WHERE s.profile_id = ?`
      )
      .all(id, id) as { id: string }[]
    const deleteEmbedding = db.prepare('DELETE FROM embeddings WHERE ref_id = ?')
    for (const ref of refs) deleteEmbedding.run(ref.id)

    db.prepare('DELETE FROM spaces WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM visits WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM downloads WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM extensions WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM favorite_folders WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM favorites WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  },

  count(): number {
    return (getDb().prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }).n
  }
}

// ─── Espaces ─────────────────────────────────────────────────────────────────

interface SpaceRow {
  id: string
  name: string
  hue: number
  position: number
  canvas_x: number
  canvas_y: number
  canvas_zoom: number
  created_at: number
}

const toSpace = (r: SpaceRow): Space => ({
  id: r.id,
  name: r.name,
  hue: r.hue,
  position: r.position,
  canvas: { x: r.canvas_x, y: r.canvas_y, zoom: r.canvas_zoom },
  createdAt: r.created_at
})

export const spacesRepo = {
  listByProfile(profileId: ProfileId): Space[] {
    const rows = getDb()
      .prepare('SELECT * FROM spaces WHERE profile_id = ? ORDER BY position, created_at')
      .all(profileId) as SpaceRow[]
    return rows.map(toSpace)
  },

  get(id: SpaceId): Space | null {
    const row = getDb().prepare('SELECT * FROM spaces WHERE id = ?').get(id) as SpaceRow | undefined
    return row ? toSpace(row) : null
  },

  profileOf(id: SpaceId): ProfileId | null {
    const row = getDb().prepare('SELECT profile_id AS p FROM spaces WHERE id = ?').get(id) as
      | { p: ProfileId }
      | undefined
    return row?.p ?? null
  },

  create(name: string, hue: number, profileId: ProfileId): Space {
    const row: SpaceRow = {
      id: randomUUID(),
      name,
      hue,
      position: (getDb().prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM spaces').get() as { p: number }).p,
      canvas_x: 0,
      canvas_y: 0,
      canvas_zoom: 1,
      created_at: Date.now()
    }
    getDb()
      .prepare(
        `INSERT INTO spaces (id, name, hue, position, canvas_x, canvas_y, canvas_zoom, created_at, profile_id)
         VALUES (@id, @name, @hue, @position, @canvas_x, @canvas_y, @canvas_zoom, @created_at, @profile_id)`
      )
      .run({ ...row, profile_id: profileId })
    return toSpace(row)
  },

  rename(id: SpaceId, name: string): void {
    getDb().prepare('UPDATE spaces SET name = ? WHERE id = ?').run(name, id)
  },

  remove(id: SpaceId): void {
    const db = getDb()
    // `pages`/`notes` disparaissent par cascade SQL (`ON DELETE CASCADE`,
    // `foreign_keys = ON`) — mais `embeddings.ref_id` n'a aucune contrainte de
    // clé étrangère (référence lâche, `page` ou `note`), donc rien ne les
    // efface automatiquement : sans ce nettoyage explicite, supprimer un
    // espace entier laissait leurs embeddings orphelins en base pour de bon.
    const refs = [
      ...(db.prepare('SELECT id FROM pages WHERE space_id = ?').all(id) as { id: string }[]),
      ...(db.prepare('SELECT id FROM notes WHERE space_id = ?').all(id) as { id: string }[])
    ]
    const deleteEmbedding = db.prepare('DELETE FROM embeddings WHERE ref_id = ?')
    for (const { id: refId } of refs) deleteEmbedding.run(refId)
    db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
  },

  updateCanvas(id: SpaceId, view: CanvasView): void {
    getDb()
      .prepare('UPDATE spaces SET canvas_x = ?, canvas_y = ?, canvas_zoom = ? WHERE id = ?')
      .run(view.x, view.y, view.zoom, id)
  },

  setHue(id: SpaceId, hue: number): void {
    getDb().prepare('UPDATE spaces SET hue = ? WHERE id = ?').run(hue, id)
  }
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export interface PageRow {
  id: string
  space_id: string
  url: string
  title: string
  favicon_url: string | null
  parent_id: string | null
  canvas_x: number
  canvas_y: number
  canvas_w: number
  canvas_h: number
  preview_version: number
  created_at: number
  last_visited_at: number
  position: number
  muted: number
}

export const pagesRepo = {
  listAll(): PageRow[] {
    return getDb().prepare('SELECT * FROM pages ORDER BY created_at').all() as PageRow[]
  },

  listByProfile(profileId: ProfileId): PageRow[] {
    return getDb()
      .prepare(
        `SELECT p.* FROM pages p JOIN spaces s ON p.space_id = s.id
         WHERE s.profile_id = ? ORDER BY p.position, p.created_at`
      )
      .all(profileId) as PageRow[]
  },

  listBySpace(spaceId: SpaceId): PageRow[] {
    return getDb()
      .prepare('SELECT * FROM pages WHERE space_id = ? ORDER BY position, created_at')
      .all(spaceId) as PageRow[]
  },

  get(id: PageId): PageRow | undefined {
    return getDb().prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRow | undefined
  },

  create(p: {
    spaceId: SpaceId
    url: string
    parentId: string | null
    canvas: CanvasRect
  }): PageRow {
    const now = Date.now()
    const position = (
      getDb()
        .prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM pages WHERE space_id = ?')
        .get(p.spaceId) as { p: number }
    ).p
    const row: PageRow = {
      id: randomUUID(),
      space_id: p.spaceId,
      url: p.url,
      title: '',
      favicon_url: null,
      parent_id: p.parentId,
      canvas_x: p.canvas.x,
      canvas_y: p.canvas.y,
      canvas_w: p.canvas.w,
      canvas_h: p.canvas.h,
      preview_version: 0,
      created_at: now,
      last_visited_at: now,
      position,
      muted: 0
    }
    getDb()
      .prepare(
        `INSERT INTO pages (id, space_id, url, title, favicon_url, parent_id,
                            canvas_x, canvas_y, canvas_w, canvas_h,
                            preview_version, created_at, last_visited_at, position, muted)
         VALUES (@id, @space_id, @url, @title, @favicon_url, @parent_id,
                 @canvas_x, @canvas_y, @canvas_w, @canvas_h,
                 @preview_version, @created_at, @last_visited_at, @position, @muted)`
      )
      .run(row)
    return row
  },

  setMuted(id: PageId, muted: boolean): void {
    getDb().prepare('UPDATE pages SET muted = ? WHERE id = ?').run(muted ? 1 : 0, id)
  },

  /** Réordonne les pages d'un espace selon la liste d'ids fournie (bande de pages). */
  reorder(spaceId: SpaceId, orderedIds: PageId[]): void {
    const stmt = getDb().prepare('UPDATE pages SET position = ? WHERE id = ? AND space_id = ?')
    const tx = getDb().transaction((ids: PageId[]) => {
      ids.forEach((id, i) => stmt.run(i, id, spaceId))
    })
    tx(orderedIds)
  },

  updateNavigation(id: PageId, url: string): void {
    getDb()
      .prepare('UPDATE pages SET url = ?, last_visited_at = ? WHERE id = ?')
      .run(url, Date.now(), id)
  },

  updateTitle(id: PageId, title: string): void {
    getDb().prepare('UPDATE pages SET title = ? WHERE id = ?').run(title, id)
  },

  updateFavicon(id: PageId, faviconUrl: string | null): void {
    getDb().prepare('UPDATE pages SET favicon_url = ? WHERE id = ?').run(faviconUrl, id)
  },

  updateCanvas(id: PageId, rect: CanvasRect): void {
    getDb()
      .prepare('UPDATE pages SET canvas_x = ?, canvas_y = ?, canvas_w = ?, canvas_h = ? WHERE id = ?')
      .run(rect.x, rect.y, rect.w, rect.h, id)
  },

  bumpPreview(id: PageId): number {
    getDb()
      .prepare('UPDATE pages SET preview_version = preview_version + 1 WHERE id = ?')
      .run(id)
    const row = getDb()
      .prepare('SELECT preview_version FROM pages WHERE id = ?')
      .get(id) as { preview_version: number } | undefined
    return row?.preview_version ?? 0
  },

  remove(id: PageId): void {
    getDb().prepare('DELETE FROM pages WHERE id = ?').run(id)
    getDb().prepare('DELETE FROM embeddings WHERE ref_id = ?').run(id)
  }
}

// ─── Dossiers de favoris ─────────────────────────────────────────────────────

export interface FavoriteFolderRow {
  id: string
  profile_id: string
  name: string
  position: number
  created_at: number
}

export const favoriteFoldersRepo = {
  listByProfile(profileId: ProfileId): FavoriteFolderRow[] {
    return getDb()
      .prepare('SELECT * FROM favorite_folders WHERE profile_id = ? ORDER BY position, created_at')
      .all(profileId) as FavoriteFolderRow[]
  },

  create(profileId: ProfileId, name: string): FavoriteFolderRow {
    const position = (
      getDb()
        .prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM favorite_folders WHERE profile_id = ?')
        .get(profileId) as { p: number }
    ).p
    const row: FavoriteFolderRow = { id: randomUUID(), profile_id: profileId, name, position, created_at: Date.now() }
    getDb()
      .prepare(
        'INSERT INTO favorite_folders (id, profile_id, name, position, created_at) VALUES (@id, @profile_id, @name, @position, @created_at)'
      )
      .run(row)
    return row
  },

  rename(id: string, name: string): void {
    getDb().prepare('UPDATE favorite_folders SET name = ? WHERE id = ?').run(name, id)
  },

  /** Supprime le dossier ; les favoris qu'il contenait redeviennent « sans dossier ». */
  remove(id: string): void {
    getDb().prepare('UPDATE favorites SET folder_id = NULL WHERE folder_id = ?').run(id)
    getDb().prepare('DELETE FROM favorite_folders WHERE id = ?').run(id)
  }
}

// ─── Favoris (signets — entité indépendante des pages, façon Chrome) ────────

export interface FavoriteRow {
  id: string
  profile_id: string
  url: string
  title: string
  favicon_url: string | null
  space_id: string | null
  folder_id: string | null
  position: number
  created_at: number
}

export const favoritesRepo = {
  listByProfile(profileId: ProfileId): FavoriteRow[] {
    return getDb()
      .prepare('SELECT * FROM favorites WHERE profile_id = ? ORDER BY position, created_at')
      .all(profileId) as FavoriteRow[]
  },

  get(id: string): FavoriteRow | undefined {
    return getDb().prepare('SELECT * FROM favorites WHERE id = ?').get(id) as FavoriteRow | undefined
  },

  /** Un signet peut exister pour une URL donnée dans un seul profil à la fois
   * (contrairement à Chrome qui autorise les doublons) — plus simple, et
   * suffisant pour refléter l'état « étoile » d'une page ouverte. */
  findByUrl(profileId: ProfileId, url: string): FavoriteRow | undefined {
    return getDb()
      .prepare('SELECT * FROM favorites WHERE profile_id = ? AND url = ? LIMIT 1')
      .get(profileId, url) as FavoriteRow | undefined
  },

  create(
    profileId: ProfileId,
    f: { url: string; title: string; faviconUrl: string | null; spaceId: string | null }
  ): FavoriteRow {
    const position = (
      getDb()
        .prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM favorites WHERE profile_id = ?')
        .get(profileId) as { p: number }
    ).p
    const row: FavoriteRow = {
      id: randomUUID(),
      profile_id: profileId,
      url: f.url,
      title: f.title,
      favicon_url: f.faviconUrl,
      space_id: f.spaceId,
      folder_id: null,
      position,
      created_at: Date.now()
    }
    getDb()
      .prepare(
        `INSERT INTO favorites (id, profile_id, url, title, favicon_url, space_id, folder_id, position, created_at)
         VALUES (@id, @profile_id, @url, @title, @favicon_url, @space_id, @folder_id, @position, @created_at)`
      )
      .run(row)
    return row
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM favorites WHERE id = ?').run(id)
  },

  removeByUrl(profileId: ProfileId, url: string): void {
    getDb().prepare('DELETE FROM favorites WHERE profile_id = ? AND url = ?').run(profileId, url)
  },

  /** Range (ou sort avec `null`) un favori. En sortant d'un dossier, on lui
   * donne une position FRAÎCHE en fin de liste « sans dossier » — sans ça il
   * garde sa vieille position (souvent 0 ou proche, héritée d'avant son
   * rangement) et resurgit tout à gauche de la barre au lieu de s'ajouter
   * à la suite des autres favoris déjà à la racine. */
  setFolder(id: string, folderId: string | null): void {
    const db = getDb()
    if (folderId === null) {
      const row = db.prepare('SELECT profile_id FROM favorites WHERE id = ?').get(id) as
        | { profile_id: string }
        | undefined
      if (row) {
        const nextPosition = (
          db
            .prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM favorites WHERE profile_id = ? AND folder_id IS NULL')
            .get(row.profile_id) as { p: number }
        ).p
        db.prepare('UPDATE favorites SET folder_id = NULL, position = ? WHERE id = ?').run(nextPosition, id)
        return
      }
    }
    db.prepare('UPDATE favorites SET folder_id = ? WHERE id = ?').run(folderId, id)
  },

  /** Réordonne les favoris (barre de favoris, glisser-déposer). */
  reorder(profileId: ProfileId, orderedIds: string[]): void {
    const stmt = getDb().prepare('UPDATE favorites SET position = ? WHERE id = ? AND profile_id = ?')
    const tx = getDb().transaction((ids: string[]) => {
      ids.forEach((id, i) => stmt.run(i, id, profileId))
    })
    tx(orderedIds)
  }
}

// ─── Notes ───────────────────────────────────────────────────────────────────

interface NoteRow {
  id: string
  space_id: string
  page_id: string | null
  page_title: string | null
  content: string
  created_at: number
}

const toNote = (r: NoteRow): NoteItem => ({
  id: r.id,
  spaceId: r.space_id,
  pageId: r.page_id,
  pageTitle: r.page_title,
  content: r.content,
  createdAt: r.created_at
})

export const notesRepo = {
  listAll(): NoteItem[] {
    const rows = getDb()
      .prepare('SELECT * FROM notes ORDER BY created_at DESC')
      .all() as NoteRow[]
    return rows.map(toNote)
  },

  listByProfile(profileId: ProfileId): NoteItem[] {
    const rows = getDb()
      .prepare(
        `SELECT n.* FROM notes n JOIN spaces s ON n.space_id = s.id
         WHERE s.profile_id = ? ORDER BY n.created_at DESC`
      )
      .all(profileId) as NoteRow[]
    return rows.map(toNote)
  },

  create(n: {
    spaceId: SpaceId
    pageId: string | null
    pageTitle: string | null
    content: string
  }): NoteItem {
    const row: NoteRow = {
      id: randomUUID(),
      space_id: n.spaceId,
      page_id: n.pageId,
      page_title: n.pageTitle,
      content: n.content,
      created_at: Date.now()
    }
    getDb()
      .prepare(
        `INSERT INTO notes (id, space_id, page_id, page_title, content, created_at)
         VALUES (@id, @space_id, @page_id, @page_title, @content, @created_at)`
      )
      .run(row)
    return toNote(row)
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
  }
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

export interface EmbeddingRow {
  ref_id: string
  ref_type: string
  model: string
  dims: number
  vector: Buffer
  updated_at: number
}

export const embeddingsRepo = {
  upsert(refId: string, refType: 'page' | 'note', model: string, vector: Float32Array): void {
    getDb()
      .prepare(
        `INSERT INTO embeddings (ref_id, ref_type, model, dims, vector, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(ref_id) DO UPDATE SET
           model = excluded.model, dims = excluded.dims,
           vector = excluded.vector, updated_at = excluded.updated_at`
      )
      .run(refId, refType, model, vector.length, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength), Date.now())
  },

  forRefs(refIds: string[]): EmbeddingRow[] {
    if (refIds.length === 0) return []
    const placeholders = refIds.map(() => '?').join(',')
    return getDb()
      .prepare(`SELECT * FROM embeddings WHERE ref_id IN (${placeholders})`)
      .all(...refIds) as EmbeddingRow[]
  }
}

// ─── Historique de navigation ────────────────────────────────────────────────

interface VisitRow {
  id: string
  profile_id: string
  url: string
  title: string
  favicon_url: string | null
  visited_at: number
}

const toVisit = (r: VisitRow): Visit => ({
  id: r.id,
  url: r.url,
  title: r.title,
  faviconUrl: r.favicon_url,
  visitedAt: r.visited_at
})

/** Une navigation (redirections, `history.pushState`…) peut déclencher
 * plusieurs `did-stop-loading` coup sur coup pour la MÊME page — sans
 * déduplication, chacun insérait sa propre ligne, faisant apparaître le
 * même titre plusieurs fois d'affilée dans l'historique/les « récents ». */
const VISIT_DEDUP_WINDOW_MS = 30_000

export const visitsRepo = {
  record(profileId: ProfileId, url: string, title: string, faviconUrl: string | null): void {
    const db = getDb()
    const recent = db
      .prepare(
        `SELECT id FROM visits WHERE profile_id = ? AND url = ? AND visited_at >= ?
         ORDER BY visited_at DESC LIMIT 1`
      )
      .get(profileId, url, Date.now() - VISIT_DEDUP_WINDOW_MS) as { id: string } | undefined
    if (recent) {
      db.prepare('UPDATE visits SET title = ?, favicon_url = ?, visited_at = ? WHERE id = ?').run(
        title,
        faviconUrl,
        Date.now(),
        recent.id
      )
      return
    }
    db.prepare(
      `INSERT INTO visits (id, profile_id, url, title, favicon_url, visited_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), profileId, url, title, faviconUrl, Date.now())
  },

  search(profileId: ProfileId, query: string, limit = 6): Visit[] {
    // Le filtre `LIKE '%…%'` ne peut pas passer par un index (jocker en
    // tête) : sans borne, ce scan retombe sur TOUTE la table, dont la
    // taille ne fait que croître sur la durée de vie de l'appli — et
    // better-sqlite3 étant synchrone, un scan lent bloquerait tout le
    // process principal à chaque frappe dans le champ de recherche (même
    // classe de risque que `dirSize()` avant sa mise en cache, cf. mémoire
    // perf). On borne donc D'ABORD aux visites les plus récentes (requête
    // couverte par `idx_visits_profile`), puis on filtre ce sous-ensemble
    // — coût constant quelle que soit la taille totale de l'historique.
    const RECENT_WINDOW = 3000
    const like = `%${query.toLowerCase()}%`
    const rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM visits WHERE profile_id = ? ORDER BY visited_at DESC LIMIT ?
         )
         WHERE (lower(url) LIKE ? OR lower(title) LIKE ?)
         ORDER BY visited_at DESC LIMIT ?`
      )
      .all(profileId, RECENT_WINDOW, like, like, limit) as VisitRow[]
    return rows.map(toVisit)
  },

  recent(profileId: ProfileId, limit = 200): Visit[] {
    const rows = getDb()
      .prepare('SELECT * FROM visits WHERE profile_id = ? ORDER BY visited_at DESC LIMIT ?')
      .all(profileId, limit) as VisitRow[]
    return rows.map(toVisit)
  },

  /** Efface l'historique du profil ; `sinceTs` null = tout effacer. */
  clear(profileId: ProfileId, sinceTs: number | null): void {
    if (sinceTs === null) {
      getDb().prepare('DELETE FROM visits WHERE profile_id = ?').run(profileId)
    } else {
      getDb()
        .prepare('DELETE FROM visits WHERE profile_id = ? AND visited_at >= ?')
        .run(profileId, sinceTs)
    }
  },

  /** Efface une seule visite (`profileId` scope la suppression au profil actif). */
  remove(profileId: ProfileId, id: string): void {
    getDb().prepare('DELETE FROM visits WHERE profile_id = ? AND id = ?').run(profileId, id)
  }
}

// ─── Requêtes de recherche (barre de recherche / barre d'intention) ─────────
// Table dédiée, séparée de `visits` : le menu « récents » du champ de
// recherche ne doit montrer que ce qu'on a vraiment tapé/cherché, jamais les
// pages simplement visitées (lien cliqué, favori ouvert…).

interface SearchQueryRow {
  id: string
  profile_id: string
  query: string
  searched_at: number
}

const toRecentSearch = (r: SearchQueryRow): RecentSearch => ({
  id: r.id,
  query: r.query,
  searchedAt: r.searched_at
})

export const searchQueriesRepo = {
  record(profileId: ProfileId, query: string): void {
    const q = query.trim()
    if (!q) return
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM search_queries WHERE profile_id = ? AND lower(query) = lower(?)')
      .get(profileId, q) as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE search_queries SET query = ?, searched_at = ? WHERE id = ?').run(
        q,
        Date.now(),
        existing.id
      )
      return
    }
    db.prepare(
      'INSERT INTO search_queries (id, profile_id, query, searched_at) VALUES (?, ?, ?, ?)'
    ).run(randomUUID(), profileId, q, Date.now())
  },

  recent(profileId: ProfileId, limit = 20): RecentSearch[] {
    const rows = getDb()
      .prepare('SELECT * FROM search_queries WHERE profile_id = ? ORDER BY searched_at DESC LIMIT ?')
      .all(profileId, limit) as SearchQueryRow[]
    return rows.map(toRecentSearch)
  }
}

// ─── Téléchargements ─────────────────────────────────────────────────────────

interface DownloadRow {
  id: string
  profile_id: string
  filename: string
  path: string
  url: string
  total_bytes: number
  received_bytes: number
  state: DownloadState
  started_at: number
  completed_at: number | null
}

const toDownload = (r: DownloadRow): DownloadEntry => ({
  id: r.id,
  filename: r.filename,
  path: r.path,
  url: r.url,
  totalBytes: r.total_bytes,
  receivedBytes: r.received_bytes,
  state: r.state,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  // Recalculé côté IPC (main/ipc.ts) à partir du disque pour les téléchargements
  // terminés — le repo n'a pas à connaître le système de fichiers.
  fileExists: true
})

export const downloadsRepo = {
  create(profileId: ProfileId, d: { filename: string; path: string; url: string; totalBytes: number }): string {
    const id = randomUUID()
    getDb()
      .prepare(
        `INSERT INTO downloads (id, profile_id, filename, path, url, total_bytes, received_bytes, state, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'progressing', ?, NULL)`
      )
      .run(id, profileId, d.filename, d.path, d.url, d.totalBytes, Date.now())
    return id
  },

  updateProgress(id: string, receivedBytes: number): void {
    getDb().prepare('UPDATE downloads SET received_bytes = ? WHERE id = ?').run(receivedBytes, id)
  },

  finish(id: string, state: DownloadState, path: string): void {
    getDb()
      .prepare('UPDATE downloads SET state = ?, path = ?, completed_at = ? WHERE id = ?')
      .run(state, path, Date.now(), id)
  },

  listByProfile(profileId: ProfileId, limit = 200): DownloadEntry[] {
    const rows = getDb()
      .prepare('SELECT * FROM downloads WHERE profile_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(profileId, limit) as DownloadRow[]
    return rows.map(toDownload)
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM downloads WHERE id = ?').run(id)
  },

  /** Efface l'historique des téléchargements du profil ; `sinceTs` null = tout. */
  clear(profileId: ProfileId, sinceTs: number | null): void {
    if (sinceTs === null) {
      getDb().prepare('DELETE FROM downloads WHERE profile_id = ?').run(profileId)
    } else {
      getDb()
        .prepare('DELETE FROM downloads WHERE profile_id = ? AND started_at >= ?')
        .run(profileId, sinceTs)
    }
  }
}

// ─── Extensions ──────────────────────────────────────────────────────────────

interface ExtensionRow {
  id: string
  profile_id: string
  extension_id: string | null
  name: string
  path: string
  enabled: number
  added_at: number
}

/** Champs réellement stockés en base — le reste d'`ExtensionInfo` (description,
 * version, taille, permissions…) est dérivé du manifest.json à la volée par
 * `toInfo()` (main/extensions.ts), pas stocké ici. */
type ExtensionDbInfo = Pick<ExtensionInfo, 'id' | 'extensionId' | 'name' | 'path' | 'enabled' | 'addedAt'>

const toExtension = (r: ExtensionRow): ExtensionDbInfo => ({
  id: r.id,
  extensionId: r.extension_id,
  name: r.name,
  path: r.path,
  enabled: Boolean(r.enabled),
  addedAt: r.added_at
})

export const extensionsRepo = {
  listByProfile(profileId: ProfileId): ExtensionDbInfo[] {
    const rows = getDb()
      .prepare('SELECT * FROM extensions WHERE profile_id = ? ORDER BY added_at')
      .all(profileId) as ExtensionRow[]
    return rows.map(toExtension)
  },

  add(profileId: ProfileId, path: string, name: string): string {
    const id = randomUUID()
    getDb()
      .prepare(
        `INSERT INTO extensions (id, profile_id, extension_id, name, path, enabled, added_at)
         VALUES (?, ?, NULL, ?, ?, 1, ?)`
      )
      .run(id, profileId, name, path, Date.now())
    return id
  },

  setExtensionId(id: string, extensionId: string): void {
    getDb().prepare('UPDATE extensions SET extension_id = ? WHERE id = ?').run(extensionId, id)
  },

  setName(id: string, name: string): void {
    getDb().prepare('UPDATE extensions SET name = ? WHERE id = ?').run(name, id)
  },

  setEnabled(id: string, enabled: boolean): void {
    getDb().prepare('UPDATE extensions SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM extensions WHERE id = ?').run(id)
  }
}

// ─── Permissions de site (surcharges par origine, façon Chrome) ─────────────

export type SitePermissionKind = 'media' | 'geolocation' | 'notifications'
export type SitePermissionState = 'ask' | 'allow' | 'block'

export const sitePermissionsRepo = {
  /** Toutes les surcharges d'une origine pour ce profil (kind → state). */
  forOrigin(profileId: ProfileId, origin: string): Record<string, SitePermissionState> {
    const rows = getDb()
      .prepare('SELECT kind, state FROM site_permissions WHERE profile_id = ? AND origin = ?')
      .all(profileId, origin) as { kind: string; state: SitePermissionState }[]
    const out: Record<string, SitePermissionState> = {}
    for (const r of rows) out[r.kind] = r.state
    return out
  },

  /** Lit une seule surcharge, ou null si absente (→ suit le réglage global). */
  get(profileId: ProfileId, origin: string, kind: SitePermissionKind): SitePermissionState | null {
    const row = getDb()
      .prepare('SELECT state FROM site_permissions WHERE profile_id = ? AND origin = ? AND kind = ?')
      .get(profileId, origin, kind) as { state: SitePermissionState } | undefined
    return row?.state ?? null
  },

  /** 'ask' = pas de surcharge → supprime la ligne pour rester au réglage global. */
  set(profileId: ProfileId, origin: string, kind: SitePermissionKind, state: SitePermissionState): void {
    if (state === 'ask') {
      getDb()
        .prepare('DELETE FROM site_permissions WHERE profile_id = ? AND origin = ? AND kind = ?')
        .run(profileId, origin, kind)
      return
    }
    getDb()
      .prepare(
        `INSERT INTO site_permissions (id, profile_id, origin, kind, state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, origin, kind) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      )
      .run(randomUUID(), profileId, origin, kind, state, Date.now())
  }
}

// ─── Moteurs de recherche personnalisés ─────────────────────────────────────

export const searchEnginesRepo = {
  list(): { id: string; label: string; url: string; createdAt: number }[] {
    const rows = getDb().prepare('SELECT * FROM search_engines ORDER BY created_at').all() as {
      id: string
      label: string
      url: string
      created_at: number
    }[]
    return rows.map((r) => ({ id: r.id, label: r.label, url: r.url, createdAt: r.created_at }))
  },

  create(label: string, url: string): { id: string; label: string; url: string; createdAt: number } {
    const id = randomUUID()
    const created_at = Date.now()
    getDb()
      .prepare('INSERT INTO search_engines (id, label, url, created_at) VALUES (?, ?, ?, ?)')
      .run(id, label, url, created_at)
    return { id, label, url, createdAt: created_at }
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM search_engines WHERE id = ?').run(id)
  }
}

// ─── Réglages (clé/valeur) ───────────────────────────────────────────────────

export const kvRepo = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  },

  set(key: string, value: string): void {
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  },

  remove(key: string): void {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}
