import type { FastifyReply, FastifyRequest } from 'fastify'

import type { Account } from '../domain/Account'
import { SESSION_TTL_MS } from '../domain/policies'
import type { AuthenticateUseCase } from '../application/useCases'
import { NotAuthenticatedError } from '../application/errors'
import { rejectWith } from '../../../shared/http/errors'

export const SESSION_COOKIE = 'hs_session'
const COOKIE_PATH = '/api'

/**
 * Transport de la session : un cookie `HttpOnly` (invisible au JavaScript de la
 * page, donc à une injection de script), `SameSite=Lax` (absent des requêtes
 * intersites), limité à `/api`. `Secure` en production seulement : en
 * développement, l'application est servie en HTTP.
 *
 * Tout ce qui est cookie vit ici ; les use cases ne voient qu'un jeton.
 */
export class SessionTransport {
  constructor(
    private readonly authenticateUseCase: AuthenticateUseCase,
    private readonly secureCookies: boolean,
  ) {}

  tokenOf(request: FastifyRequest): string | null {
    const token = request.cookies[SESSION_COOKIE]
    return token === undefined || token === '' ? null : token
  }

  grant(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'lax',
      path: COOKIE_PATH,
      maxAge: SESSION_TTL_MS / 1000,
    })
  }

  revoke(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: COOKIE_PATH })
  }

  /** Compte connecté, ou `null` — une session absente n'est pas une erreur. */
  async current(request: FastifyRequest, reply: FastifyReply): Promise<Account | null> {
    const token = this.tokenOf(request)
    if (token === null) return null

    const result = await this.authenticateUseCase.execute(token)
    if (!result.ok) {
      this.revoke(reply)
      return null
    }
    if (result.value.extended) this.grant(reply, token)
    return result.value.account
  }

  /** Compte connecté, ou réponse 401. Utilisé par toute route réservée aux comptes. */
  async require(request: FastifyRequest, reply: FastifyReply): Promise<Account> {
    const account = await this.current(request, reply)
    return account ?? rejectWith(new NotAuthenticatedError())
  }
}
