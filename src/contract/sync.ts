import { z } from 'zod'

/**
 * Routes `/api/sync/*` : l'envoi des modifications locales et la lecture des
 * modifications distantes.
 *
 * Le contenu d'un enregistrement (`payload`) est celui que le client stocke
 * dans IndexedDB : un seul format de sérialisation, déjà versionné par les
 * migrations locales. Le serveur n'en lit que ce qu'il lui faut pour autoriser
 * l'écriture — l'identifiant, le profil propriétaire, la source d'un aliment.
 */
export const SYNC_ROUTE = {
  push: '/sync/push',
  pull: '/sync/pull',
} as const

export const SYNC_ENTITIES = ['player', 'meal', 'food'] as const
export type SyncEntityName = (typeof SYNC_ENTITIES)[number]

/** Au-delà, le client découpe : un envoi reste court même après une semaine hors ligne. */
export const MAX_CHANGES_PER_PUSH = 100
export const MAX_CHANGES_PER_PULL = 500

const entity = z.enum(SYNC_ENTITIES)
const id = z.string().min(1).max(128)
const payload = z.record(z.string(), z.unknown())

export const outgoingChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsert'), entity, id, payload }),
  z.object({ op: z.literal('delete'), entity, id }),
])
export type OutgoingChange = z.infer<typeof outgoingChangeSchema>

export const pushRequestSchema = z.object({
  changes: z.array(outgoingChangeSchema).max(MAX_CHANGES_PER_PUSH),
})

export const rejectedChangeSchema = z.object({ entity, id, code: z.string() })
export type RejectedChange = z.infer<typeof rejectedChangeSchema>

/** `rejected` : modifications refusées pour de bon — les renvoyer n'y changerait rien. */
export const pushResponseSchema = z.object({ rejected: z.array(rejectedChangeSchema) })

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
})

export const remoteChangeSchema = z.discriminatedUnion('deleted', [
  z.object({ deleted: z.literal(false), entity, id, payload, revision: z.number().int() }),
  z.object({ deleted: z.literal(true), entity, id, revision: z.number().int() }),
])
export type RemoteChange = z.infer<typeof remoteChangeSchema>

/** `revision` : nouveau curseur ; `hasMore` : relire aussitôt, la page était pleine. */
export const pullResponseSchema = z.object({
  changes: z.array(remoteChangeSchema),
  revision: z.number().int(),
  hasMore: z.boolean(),
})
export type PullResponse = z.infer<typeof pullResponseSchema>
