import type { FastifyReply, FastifyRequest } from 'fastify'

import type { Email } from '@/core/Email'
import type { AccountId, PlayerId } from '@/core/identity'

/** Compte connecté, tel que le voient les modules autres que `account`. */
export interface AuthenticatedAccount {
  readonly id: AccountId
  readonly email: Email
  /** Toujours vrai en pratique — aucune session ne s'ouvre avant confirmation —, mais vérifié là où l'adresse fait foi. */
  readonly isVerified: boolean
  readonly playerId: PlayerId | null
}

/**
 * Accès à la session, injecté dans les routes qui l'exigent. Les autres modules
 * n'importent pas le module `account` : ils reçoivent ce port à la composition.
 */
export interface IAuthenticator {
  require(request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedAccount>
}
