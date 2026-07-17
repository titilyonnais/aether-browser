/**
 * Schémas de validation des payloads IPC les plus complexes/à risque —
 * pas une couverture exhaustive de tous les canaux (des dizaines dans
 * ipc.ts, la plupart de simples chaînes/booléens déjà sûrs par nature),
 * mais des formes structurées (objets imbriqués, tableaux, nombres utilisés
 * ensuite en géométrie/SQL) où un renderer compromis ou une extension
 * chargée pourrait envoyer une valeur malformée. Un canal `ipcMain.on`
 * (fire-and-forget) qui LÈVE une exception fait planter tout le process
 * principal (voir `logger.ts`/mémoire du projet) — d'où `safeParse` partout
 * ici, jamais de `parse()` qui lancerait.
 */
import { z } from 'zod'
import { logger } from './logger'

export const idSchema = z.string().min(1).max(200)
export const idArraySchema = z.array(idSchema).max(64)

export const localRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite()
})

export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative()
})

export const canvasRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive()
})

export const canvasViewSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive()
})

export const openPageOptionsSchema = z.object({
  url: z.string().min(1).max(4000),
  spaceId: idSchema,
  parentId: idSchema.nullable().optional(),
  canvasPos: z
    .object({ x: z.number().finite(), y: z.number().finite() })
    .nullable()
    .optional()
})

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(50_000)
})

export const chatRequestSchema = z.object({
  requestId: idSchema,
  messages: z.array(chatMessageSchema).max(300),
  context: z
    .object({
      spaceName: z.string().max(500),
      page: z.object({ title: z.string().max(2000), url: z.string().max(4000), excerpt: z.string().max(20_000) }).optional(),
      selection: z.object({ title: z.string().max(2000), url: z.string().max(4000) }).optional()
    })
    .nullable()
})

const favoritesOverflowEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('favorite'), id: idSchema }),
  z.object({ kind: z.literal('folder'), id: idSchema })
])
export const favoritesOverflowEntriesSchema = z.array(favoritesOverflowEntrySchema).max(500)

/** Valide `data` contre `schema` ; en cas d'échec, journalise et renvoie
 * `undefined` — jamais de throw (voir le commentaire d'en-tête). À utiliser
 * dans les handlers `ipcMain.on` (fire-and-forget). */
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown, scope: string): T | undefined {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  logger.warn('ipc.validation', `Payload rejeté pour ${scope}`, result.error.message)
  return undefined
}
