import type { RemoteError, ValidationError } from '@/core/errors'
import type { AccountId, PlayerId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { Email } from '@/core/Email'

/**
 * Session ouverte sur le serveur de l'application.
 *
 * Le compte est l'identité de connexion ; le profil (`playerId`) reste celui de
 * `player_profile`. Les deux sont liés un pour un, mais distincts : on peut
 * avoir un profil sans compte (usage local), et un compte fraîchement créé n'a
 * pas encore de profil.
 */
export interface AccountSession {
  readonly accountId: AccountId
  /** Déjà normalisée par le serveur. */
  readonly email: string
  readonly playerId: PlayerId | null
}

export type AccountGatewayError = RemoteError | ValidationError

/**
 * Port vers le service de comptes.
 *
 * Aucune notion d'HTTP, de cookie ou de jeton de session n'y apparaît : la
 * session est portée par le transport, et un autre fournisseur d'identité se
 * brancherait par un autre adaptateur.
 */
export interface IAccountGateway {
  currentSession(): Promise<Result<AccountSession | null, AccountGatewayError>>
  signUp(email: Email, password: string): Promise<Result<void, AccountGatewayError>>
  verifyEmail(token: string): Promise<Result<AccountSession, AccountGatewayError>>
  signIn(email: Email, password: string): Promise<Result<AccountSession, AccountGatewayError>>
  signOut(): Promise<Result<void, AccountGatewayError>>
  requestPasswordReset(email: Email): Promise<Result<void, AccountGatewayError>>
  resetPassword(
    token: string,
    password: string,
  ): Promise<Result<AccountSession, AccountGatewayError>>
  linkPlayer(playerId: PlayerId): Promise<Result<AccountSession, AccountGatewayError>>
  deleteAccount(password: string): Promise<Result<void, AccountGatewayError>>
}
