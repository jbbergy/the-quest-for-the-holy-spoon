import type { z } from 'zod'

import {
  ExternalPayloadInvalidError,
  RemoteRejectedError,
  ServerUnreachableError,
  type RemoteError,
  type ValidationError,
} from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

import { API_PREFIX, apiErrorSchema } from './http'

export type ApiError = RemoteError | ValidationError
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const DEFAULT_TIMEOUT_MS = 10_000
const SOURCE = 'le serveur de l’application'

type Fetch = typeof fetch

/**
 * Client du contrat HTTP, commun aux adaptateurs du navigateur.
 *
 * L'API est servie **sur la même origine** que l'application (proxy Vite en
 * développement, reverse proxy en production) : pas de CORS, pas de
 * pré-vérification, et le cookie de session voyage sans configuration. C'est
 * aussi pourquoi aucun en-tête n'est ajouté hors `Content-Type`.
 *
 * Chaque réponse est validée par le schéma Zod partagé avec le serveur : le
 * client ne fait pas plus confiance à son propre serveur qu'à Open Food Facts.
 */
export class ApiClient {
  constructor(
    private readonly fetchFn: Fetch = (...args) => globalThis.fetch(...args),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Appel sans lecture du corps de réponse. */
  async send(method: HttpMethod, path: string, body?: unknown): Promise<Result<void, ApiError>> {
    const response = await this.call(method, path, body)
    return response.ok ? ok(undefined) : response
  }

  /** Appel dont la réponse doit respecter `schema`. */
  async request<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<Result<T, ApiError>> {
    const response = await this.call(method, path, body)
    if (!response.ok) return response

    const parsed = schema.safeParse(response.value)
    return parsed.success ? ok(parsed.data) : err(new ExternalPayloadInvalidError(SOURCE))
  }

  private async call(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<Result<unknown, ApiError>> {
    let response: Response
    try {
      response = await this.fetchFn(`${API_PREFIX}${path}`, {
        method,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(this.timeoutMs),
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
    } catch (cause) {
      return err(new ServerUnreachableError(`${SOURCE} ne répond pas.`, { cause }))
    }

    const payload: unknown = await response.json().catch(() => undefined)
    if (response.ok) return ok(payload)

    const rejection = apiErrorSchema.safeParse(payload)
    // Une erreur 5xx sans corps conforme vient d'un intermédiaire (proxy de
    // développement sans serveur derrière, passerelle en panne) : pour
    // l'utilisateur, c'est un serveur injoignable.
    if (!rejection.success || response.status >= 500) {
      return err(new ServerUnreachableError(`${SOURCE} a répondu ${response.status}.`))
    }
    return err(
      new RemoteRejectedError(
        rejection.data.error.code,
        rejection.data.error.message,
        response.status,
      ),
    )
  }
}
