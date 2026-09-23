import type { FastifyInstance } from 'fastify'

import {
  MAX_CHANGES_PER_PULL,
  type PullResponse,
  pullQuerySchema,
  pushRequestSchema,
  SYNC_ROUTE,
} from '@/contract/sync'

import type { IAuthenticator } from '../../../shared/http/authenticator'
import { parseWith, rejectWith } from '../../../shared/http/errors'
import type { PullChangesUseCase, PushChangesUseCase } from '../application/useCases'

export interface SyncRoutesDependencies {
  readonly useCases: { readonly push: PushChangesUseCase; readonly pull: PullChangesUseCase }
  readonly authenticator: IAuthenticator
}

/** Adaptateur HTTP de la synchronisation : traduction seule, aucune règle. */
export function registerSyncRoutes(app: FastifyInstance, deps: SyncRoutesDependencies): void {
  app.post(SYNC_ROUTE.push, async (request, reply) => {
    const account = await deps.authenticator.require(request, reply)
    const { changes } = parseWith(pushRequestSchema, request.body)

    const result = await deps.useCases.push.execute(account, changes)
    return result.ok ? { rejected: result.value } : rejectWith(result.error)
  })

  app.get(SYNC_ROUTE.pull, async (request, reply): Promise<PullResponse> => {
    const account = await deps.authenticator.require(request, reply)
    const { since } = parseWith(pullQuerySchema, request.query)

    const page = await deps.useCases.pull.execute(account, since, MAX_CHANGES_PER_PULL)
    return {
      changes: [...page.changes],
      revision: page.changes.at(-1)?.revision ?? since,
      hasMore: page.hasMore,
    }
  })
}
