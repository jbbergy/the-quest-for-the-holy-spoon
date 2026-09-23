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
