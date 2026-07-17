/**
 * Tests des dépôts SQLite — base en mémoire (`:memory:`), aucune dépendance
 * à Electron (`openDatabase(':memory:')` bypass `app.getPath`). Couvre les
 * migrations de bout en bout et les points corrigés cette session (embeddings
 * orphelins, fenêtre bornée de la recherche d'historique).
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db/database'
import {
  embeddingsRepo,
  favoritesRepo,
  notesRepo,
  pagesRepo,
  profilesRepo,
  spacesRepo,
  visitsRepo
} from '../src/main/db/repositories'

beforeEach(() => {
  openDatabase(':memory:')
})

afterEach(() => {
  closeDatabase()
})

describe('migrate', () => {
  it('crée le schéma jusqu’à la dernière version sans erreur', () => {
    const db = openDatabase()
    expect(db.pragma('user_version', { simple: true })).toBe(10)
  })
})

describe('profilesRepo', () => {
  it('crée, liste et supprime un profil', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    expect(profilesRepo.list().map((x) => x.id)).toContain(p.id)
    profilesRepo.remove(p.id)
    expect(profilesRepo.list().map((x) => x.id)).not.toContain(p.id)
  })

  it('supprime les embeddings des pages/notes du profil en cascade', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    const space = spacesRepo.create('Espace', 210, p.id)
    const page = pagesRepo.create({ spaceId: space.id, url: 'https://a.test', parentId: null, canvas: { x: 0, y: 0, w: 1, h: 1 } })
    embeddingsRepo.upsert(page.id, 'page', 'test-model', new Float32Array([1, 2, 3]))
    expect(embeddingsRepo.forRefs([page.id])).toHaveLength(1)

    profilesRepo.remove(p.id)

    expect(embeddingsRepo.forRefs([page.id])).toHaveLength(0)
  })
})

describe('spacesRepo', () => {
  it('supprime les pages/notes en cascade et leurs embeddings', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    const space = spacesRepo.create('Espace', 210, p.id)
    const page = pagesRepo.create({ spaceId: space.id, url: 'https://a.test', parentId: null, canvas: { x: 0, y: 0, w: 1, h: 1 } })
    const note = notesRepo.create({ spaceId: space.id, pageId: null, pageTitle: null, content: 'note' })
    embeddingsRepo.upsert(page.id, 'page', 'test-model', new Float32Array([1]))
    embeddingsRepo.upsert(note.id, 'note', 'test-model', new Float32Array([1]))

    spacesRepo.remove(space.id)

    expect(pagesRepo.get(page.id)).toBeUndefined()
    expect(embeddingsRepo.forRefs([page.id, note.id])).toHaveLength(0)
  })
})

describe('pagesRepo', () => {
  it('supprime l’embedding associé à la suppression directe d’une page', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    const space = spacesRepo.create('Espace', 210, p.id)
    const page = pagesRepo.create({ spaceId: space.id, url: 'https://a.test', parentId: null, canvas: { x: 0, y: 0, w: 1, h: 1 } })
    embeddingsRepo.upsert(page.id, 'page', 'test-model', new Float32Array([1]))

    pagesRepo.remove(page.id)

    expect(pagesRepo.get(page.id)).toBeUndefined()
    expect(embeddingsRepo.forRefs([page.id])).toHaveLength(0)
  })
})

describe('embeddingsRepo.removeOrphans', () => {
  it('supprime un embedding dont la page/note référencée n’existe plus', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    const space = spacesRepo.create('Espace', 210, p.id)
    const page = pagesRepo.create({ spaceId: space.id, url: 'https://a.test', parentId: null, canvas: { x: 0, y: 0, w: 1, h: 1 } })
    embeddingsRepo.upsert(page.id, 'page', 'test-model', new Float32Array([1]))
    embeddingsRepo.upsert('id-fantome-sans-page-ni-note', 'page', 'test-model', new Float32Array([1]))

    const removed = embeddingsRepo.removeOrphans()

    expect(removed).toBe(1)
    expect(embeddingsRepo.forRefs([page.id])).toHaveLength(1)
    expect(embeddingsRepo.forRefs(['id-fantome-sans-page-ni-note'])).toHaveLength(0)
  })
})

describe('favoritesRepo', () => {
  it('crée, retrouve par URL et supprime un favori', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    const fav = favoritesRepo.create(p.id, { url: 'https://a.test', title: 'A', faviconUrl: null, spaceId: null })
    expect(favoritesRepo.findByUrl(p.id, 'https://a.test')?.id).toBe(fav.id)
    favoritesRepo.remove(fav.id)
    expect(favoritesRepo.findByUrl(p.id, 'https://a.test')).toBeUndefined()
  })
})

describe('visitsRepo.search', () => {
  it('trouve une visite par sous-chaîne du titre ou de l’URL', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    visitsRepo.record(p.id, 'https://example.test/path', 'Un Titre Unique', null)
    const byTitle = visitsRepo.search(p.id, 'titre unique')
    const byUrl = visitsRepo.search(p.id, 'example.test')
    expect(byTitle).toHaveLength(1)
    expect(byUrl).toHaveLength(1)
  })

  it('ne renvoie rien pour une autre requête', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    visitsRepo.record(p.id, 'https://example.test', 'Titre', null)
    expect(visitsRepo.search(p.id, 'zzzz-introuvable')).toHaveLength(0)
  })

  it('respecte la limite demandée', () => {
    const p = profilesRepo.create('Test', 210, { icon: '✦', color: '' })
    for (let i = 0; i < 5; i++) {
      visitsRepo.record(p.id, `https://example.test/${i}`, 'Titre commun', null)
    }
    expect(visitsRepo.search(p.id, 'titre', 2)).toHaveLength(2)
  })
})
