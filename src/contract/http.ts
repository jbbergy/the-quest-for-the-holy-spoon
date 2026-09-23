import { z } from 'zod'

/**
 * Contrat HTTP commun au client et au serveur.
 *
 * Les schémas vivent hors de `src/core`, où Zod est proscrit, et hors des
 * modules : ils décrivent le **câble**, pas le métier. Le serveur s'en sert pour
 * valider ce qu'il reçoit, le client pour valider ce qu'il reçoit en retour —
 * chacun traite l'autre comme une source externe.
 */
export const API_PREFIX = '/api'

/** Forme unique de toute réponse d'erreur. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

/** Codes d'erreur que le serveur peut renvoyer, et que l'interface traduit. */
export const API_ERROR = {
  badRequest: 'BAD_REQUEST',
  forbiddenOrigin: 'FORBIDDEN_ORIGIN',
  notAuthenticated: 'NOT_AUTHENTICATED',
  invalidCredentials: 'INVALID_CREDENTIALS',
  emailNotVerified: 'EMAIL_NOT_VERIFIED',
  tokenInvalid: 'TOKEN_INVALID',
  playerAlreadyLinked: 'PLAYER_ALREADY_LINKED',
  rateLimited: 'RATE_LIMITED',
  noProfileLinked: 'NO_PROFILE_LINKED',
  notFound: 'NOT_FOUND',
  internal: 'INTERNAL',
  notHouseholdOwner: 'NOT_HOUSEHOLD_OWNER',
  noHousehold: 'NO_HOUSEHOLD',
  alreadyInHousehold: 'ALREADY_IN_HOUSEHOLD',
  alreadyHouseholdMember: 'ALREADY_HOUSEHOLD_MEMBER',
  alreadyInvited: 'ALREADY_INVITED',
  householdFull: 'HOUSEHOLD_FULL',
  invitationNotFound: 'INVITATION_NOT_FOUND',
  memberNotFound: 'MEMBER_NOT_FOUND',
  ownerCannotLeave: 'OWNER_CANNOT_LEAVE',
  householdConflict: 'HOUSEHOLD_CONFLICT',
} as const
