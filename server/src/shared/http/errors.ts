import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod'

import { API_ERROR, type ApiErrorBody } from '@/contract/http'
import type { BaseError } from '@/core/errors'

/**
 * Erreur destinée au client : un statut HTTP, un code stable, un message pour
 * le développeur. Tout ce qui n'est pas une `HttpError` devient une erreur 500
 * anonyme — une trace de pile ne sort jamais du serveur.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Statut HTTP de chaque refus métier. Un code absent de la table est une
 * règle du domaine violée par la saisie : 400.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [API_ERROR.notAuthenticated]: 401,
  [API_ERROR.invalidCredentials]: 401,
  [API_ERROR.emailNotVerified]: 403,
  [API_ERROR.tokenInvalid]: 400,
  [API_ERROR.playerAlreadyLinked]: 409,
  [API_ERROR.noProfileLinked]: 409,
  [API_ERROR.notFound]: 404,
  [API_ERROR.notHouseholdOwner]: 403,
  [API_ERROR.noHousehold]: 404,
  [API_ERROR.invitationNotFound]: 404,
  [API_ERROR.memberNotFound]: 404,
  [API_ERROR.alreadyInHousehold]: 409,
  [API_ERROR.alreadyHouseholdMember]: 409,
  [API_ERROR.alreadyInvited]: 409,
  [API_ERROR.householdFull]: 409,
  [API_ERROR.ownerCannotLeave]: 409,
  [API_ERROR.householdConflict]: 409,
}

/** Traduit le refus d'un use case en réponse HTTP. */
export function rejectWith(error: BaseError): never {
  throw new HttpError(STATUS_BY_CODE[error.code] ?? 400, error.code, error.message)
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new HttpError(400, API_ERROR.badRequest, 'Requête mal formée.')
  }
  return parsed.data
}

export function errorHandler(
  error: FastifyError | HttpError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof HttpError) {
    return reply.status(error.status).send(body(error.code, error.message))
  }
  // Erreurs levées par Fastify lui-même : JSON invalide, type de contenu refusé…
  const status = error.statusCode ?? 500
  if (status < 500) {
    return reply.status(status).send(body(API_ERROR.badRequest, error.message))
  }
  request.log.error(error)
  return reply.status(500).send(body(API_ERROR.internal, 'Erreur interne.'))
}

function body(code: string, message: string): ApiErrorBody {
  return { error: { code, message } }
}
