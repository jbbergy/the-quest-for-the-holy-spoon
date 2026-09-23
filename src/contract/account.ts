import { z } from 'zod'

/**
 * Routes `/api/auth/*`.
 *
 * Les longueurs ne sont vérifiées ici que grossièrement : les règles fines
 * (forme de l'adresse, longueur du mot de passe) appartiennent au domaine
 * `account`, que le serveur applique après ce premier filtre.
 */
export const AUTH_ROUTE = {
  session: '/auth/session',
  signUp: '/auth/signup',
  verifyEmail: '/auth/verify',
  signIn: '/auth/login',
  signOut: '/auth/logout',
  forgotPassword: '/auth/password/forgot',
  resetPassword: '/auth/password/reset',
  linkPlayer: '/auth/player',
  account: '/auth/account',
} as const

/**
 * Pages de l'application qu'ouvrent les liens des e-mails. Le serveur les
 * construit, le routeur du client les sert : le chemin est un contrat entre eux.
 * Le jeton voyage dans le fragment (`#token=`), jamais transmis au serveur qui
 * héberge la page — il n'apparaît ni dans ses journaux ni dans un `Referer`.
 */
export const APP_LINK = {
  verifyEmail: '/verifier-email',
  resetPassword: '/mot-de-passe/reinitialiser',
} as const

export const LINK_TOKEN_PARAM = 'token'

const email = z.string().max(320)
const password = z.string().max(1024)
const token = z.string().min(16).max(256)

export const credentialsSchema = z.object({ email, password })
export type Credentials = z.infer<typeof credentialsSchema>

export const tokenRequestSchema = z.object({ token })
export const emailRequestSchema = z.object({ email })
export const resetPasswordSchema = z.object({ token, password })
export const linkPlayerSchema = z.object({ playerId: z.string().min(1).max(64) })
export const deleteAccountSchema = z.object({ password })

export const sessionAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  playerId: z.string().nullable(),
})
export type SessionAccount = z.infer<typeof sessionAccountSchema>

/** `account: null` : aucune session ouverte — ce n'est pas une erreur. */
export const sessionResponseSchema = z.object({ account: sessionAccountSchema.nullable() })
export type SessionResponse = z.infer<typeof sessionResponseSchema>

/**
 * Réponse volontairement muette des routes qui ne doivent rien révéler :
 * inscription, mot de passe oublié. Elle est identique que l'adresse ait un
 * compte ou non.
 */
export const acceptedResponseSchema = z.object({ status: z.literal('accepted') })
