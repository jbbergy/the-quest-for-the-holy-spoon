import type { FastifyRequest } from 'fastify'

import { API_ERROR } from '@/contract/http'

import { HttpError } from './errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Refuse toute mutation venue d'une origine inconnue.
 *
 * Le cookie de session est déjà `SameSite=Lax`, ce qui bloque la plupart des
 * requêtes intersites. Ce contrôle couvre le reste — anciens navigateurs,
 * sous-domaines — pour un coût nul : un navigateur envoie toujours l'en-tête
 * `Origin` sur un `fetch` non-GET. Son absence désigne un client hors
 * navigateur (tests, curl), qui ne porte pas de cookie à son insu.
 */
export function originGuard(allowedOrigins: readonly string[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (SAFE_METHODS.has(request.method)) return

    const origin = request.headers.origin
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      throw new HttpError(403, API_ERROR.forbiddenOrigin, `Origine refusée : ${origin}`)
    }
  }
}

/** Origine de la page appelante si elle est connue, pour bâtir les liens des e-mails. */
export function knownOrigin(
  request: FastifyRequest,
  allowedOrigins: readonly string[],
): string | undefined {
  const origin = request.headers.origin
  return origin !== undefined && allowedOrigins.includes(origin) ? origin : undefined
}
