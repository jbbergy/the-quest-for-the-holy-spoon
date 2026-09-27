import { z } from 'zod'

/**
 * Routes du foyer.
 *
 * `/household` : le foyer du compte connecté. `/invitations` : celles
 * adressées à son e-mail, qu'il appartienne ou non à un foyer.
 */
export const HOUSEHOLD_ROUTE = {
  household: '/household',
  invitations: '/household/invitations',
  invitation: (id: string) => `/household/invitations/${encodeURIComponent(id)}`,
  member: (accountId: string) => `/household/members/${encodeURIComponent(accountId)}`,
  leave: '/household/leave',
  sharing: '/household/sharing',
  received: '/invitations',
  accept: (id: string) => `/invitations/${encodeURIComponent(id)}/accept`,
  decline: (id: string) => `/invitations/${encodeURIComponent(id)}/decline`,
  memberDays: (playerId: string) => `/household/members/${encodeURIComponent(playerId)}/days`,
} as const

/** Page de l'application qu'ouvre l'e-mail d'invitation. */
export const HOUSEHOLD_APP_LINK = '/foyer'

const id = z.string().min(1).max(64)
const date = z.iso.datetime({ offset: true })

export const createHouseholdSchema = z.object({ name: z.string().max(200) })
export const inviteSchema = z.object({ email: z.string().max(320) })
export const daySharingSchema = z.object({ sharesDays: z.boolean() })
/** Identifiants générés par le serveur : un UUID, ou rien ne correspondra. */
export const idParamSchema = z.object({ id: z.uuid() })

export const householdSchema = z.object({
  id,
  name: z.string(),
  role: z.enum(['owner', 'member']),
  members: z.array(
    z.object({
      accountId: id,
      playerId: id.nullable(),
      name: z.string().nullable(),
      targetCalories: z.number().nullable(),
      email: z.string(),
      isOwner: z.boolean(),
      joinedAt: date,
      sharesDays: z.boolean(),
    }),
  ),
  invitations: z.array(z.object({ id, email: z.string(), expiresAt: date })),
  sharesDays: z.boolean(),
})
export type HouseholdPayload = z.infer<typeof householdSchema>

/** `household: null` : le compte n'appartient à aucun foyer. */
export const householdResponseSchema = z.object({ household: householdSchema.nullable() })

export const receivedInvitationsResponseSchema = z.object({
  invitations: z.array(
    z.object({ id, householdName: z.string(), invitedBy: z.string(), expiresAt: date }),
  ),
})
export type ReceivedInvitationsPayload = z.infer<typeof receivedInvitationsResponseSchema>

/**
 * Journées d'un membre. `from` et `to` sont des jours locaux (`AAAA-MM-JJ`),
 * bornes incluses. La plage est courte : l'écran montre un jour et la semaine
 * qui le précède, pas un historique à parcourir.
 */
export const MAX_MEMBER_DAYS = 31
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const memberDaysQuerySchema = z.object({ from: dayKey, to: dayKey })
export const memberDaysParamsSchema = z.object({ playerId: id })

/**
 * Les repas sont au format d'enregistrement de l'appareil — celui que la
 * synchronisation transporte déjà : le client les relit avec ses propres
 * mappers. `needs` : les besoins publiés par le membre, ou `null`.
 */
export const memberDaysResponseSchema = z.object({
  meals: z.array(z.record(z.string(), z.unknown())),
  needs: z.record(z.string(), z.unknown()).nullable(),
})
export type MemberDaysPayload = z.infer<typeof memberDaysResponseSchema>
