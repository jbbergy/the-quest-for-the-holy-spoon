import { AUTH_ROUTE, type SessionAccount, sessionResponseSchema } from '@/contract/account'
import { ApiClient } from '@/contract/apiClient'
import { ExternalPayloadInvalidError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import type {
  AccountGatewayError,
  AccountSession,
  IAccountGateway,
} from '../domain/AccountGateway'
import type { Email } from '../domain/Email'

/** Adaptateur HTTP du service de comptes, sur le client du contrat. */
export class HttpAccountGateway implements IAccountGateway {
  constructor(private readonly api: ApiClient = new ApiClient()) {}

  async currentSession(): Promise<Result<AccountSession | null, AccountGatewayError>> {
    const response = await this.api.request('GET', AUTH_ROUTE.session, sessionResponseSchema)
    if (!response.ok) return response
    return ok(response.value.account === null ? null : toSession(response.value.account))
  }

  signUp(email: Email, password: string): Promise<Result<void, AccountGatewayError>> {
    return this.api.send('POST', AUTH_ROUTE.signUp, { email: email.value, password })
  }

  verifyEmail(token: string): Promise<Result<AccountSession, AccountGatewayError>> {
    return this.opening('POST', AUTH_ROUTE.verifyEmail, { token })
  }

  signIn(email: Email, password: string): Promise<Result<AccountSession, AccountGatewayError>> {
    return this.opening('POST', AUTH_ROUTE.signIn, { email: email.value, password })
  }

  signOut(): Promise<Result<void, AccountGatewayError>> {
    return this.api.send('POST', AUTH_ROUTE.signOut)
  }

  requestPasswordReset(email: Email): Promise<Result<void, AccountGatewayError>> {
    return this.api.send('POST', AUTH_ROUTE.forgotPassword, { email: email.value })
  }

  resetPassword(
    token: string,
    password: string,
  ): Promise<Result<AccountSession, AccountGatewayError>> {
    return this.opening('POST', AUTH_ROUTE.resetPassword, { token, password })
  }

  linkPlayer(playerId: PlayerId): Promise<Result<AccountSession, AccountGatewayError>> {
    return this.opening('PUT', AUTH_ROUTE.linkPlayer, { playerId })
  }

  deleteAccount(password: string): Promise<Result<void, AccountGatewayError>> {
    return this.api.send('DELETE', AUTH_ROUTE.account, { password })
  }

  /** Appel qui doit aboutir à une session ouverte : une réponse sans compte est anormale. */
  private async opening(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
  ): Promise<Result<AccountSession, AccountGatewayError>> {
    const response = await this.api.request(method, path, sessionResponseSchema, body)
    if (!response.ok) return response
    return response.value.account === null
      ? err(new ExternalPayloadInvalidError('le serveur de l’application'))
      : ok(toSession(response.value.account))
  }
}

function toSession(account: SessionAccount): AccountSession {
  return {
    accountId: idFrom<'AccountId'>(account.id),
    email: account.email,
    playerId: account.playerId === null ? null : idFrom<'PlayerId'>(account.playerId),
  }
}
