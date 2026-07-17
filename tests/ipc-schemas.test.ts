import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const {
  boundsSchema,
  canvasRectSchema,
  idArraySchema,
  localRectSchema,
  openPageOptionsSchema,
  safeValidate
} = await import('../src/main/ipcSchemas')

describe('safeValidate', () => {
  it('renvoie la donnée validée quand elle respecte le schéma', () => {
    expect(safeValidate(idArraySchema, ['a', 'b'], 'test')).toEqual(['a', 'b'])
  })

  it('renvoie undefined (jamais ne lance) sur une donnée invalide', () => {
    expect(() => safeValidate(idArraySchema, [123, 456], 'test')).not.toThrow()
    expect(safeValidate(idArraySchema, [123, 456], 'test')).toBeUndefined()
  })
})

describe('boundsSchema / canvasRectSchema', () => {
  it('rejette les valeurs non finies (NaN/Infinity) — géométrie de fenêtre', () => {
    expect(boundsSchema.safeParse({ x: 0, y: 0, width: Infinity, height: 10 }).success).toBe(false)
    expect(boundsSchema.safeParse({ x: NaN, y: 0, width: 10, height: 10 }).success).toBe(false)
    expect(canvasRectSchema.safeParse({ x: 0, y: 0, w: -5, h: 10 }).success).toBe(false)
  })

  it('accepte une géométrie valide', () => {
    expect(boundsSchema.safeParse({ x: 10, y: 20, width: 300, height: 200 }).success).toBe(true)
  })
})

describe('localRectSchema', () => {
  it('rejette une ancre malformée (ex. champ manquant)', () => {
    expect(localRectSchema.safeParse({ x: 0, y: 0, width: 10 }).success).toBe(false)
  })
})

describe('openPageOptionsSchema', () => {
  it('accepte une URL et un spaceId valides, canvasPos/parentId optionnels', () => {
    const result = openPageOptionsSchema.safeParse({ url: 'https://example.test', spaceId: 'space-1' })
    expect(result.success).toBe(true)
  })

  it('rejette un spaceId vide', () => {
    expect(openPageOptionsSchema.safeParse({ url: 'https://example.test', spaceId: '' }).success).toBe(false)
  })
})
