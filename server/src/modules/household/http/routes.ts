import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import {
  createHouseholdSchema,
  daySharingSchema,
  HOUSEHOLD_ROUTE,
  idParamSchema,
  inviteSchema,
} from '@/contract/household'
import { idFrom } from '@/core/identity'
import type { HouseholdView } from '@/modules/household/domain/views'

import type { IAuthenticator } from '../../../shared/http/authenticator'
import { parseWith, rejectWith } from '../../../shared/http/errors'
import { knownOrigin } from '../../../shared/http/origin'
import { RATE, type RateLimiter } from '../../../shared/http/rateLimit'
import type {
  AcceptInvitationUseCase,
  CreateHouseholdUseCase,
  DeclineInvitationUseCase,
  DissolveHouseholdUseCase,
  GetHouseholdUseCase,
  InviteUseCase,
  LeaveHouseholdUseCase,
  ListReceivedInvitationsUseCase,
  RemoveMemberUseCase,
  RevokeInvitationUseCase,
  SetDaySharingUseCase,
} from '../application/useCases'

export interface HouseholdRoutesDependencies {
  readonly useCases: {
    readonly get: GetHouseholdUseCase
    readonly create: CreateHouseholdUseCase
    readonly invite: InviteUseCase
    readonly revoke: RevokeInvitationUseCase
    readonly removeMember: RemoveMemberUseCase
    readonly setDaySharing: SetDaySharingUseCase
    readonly leave: LeaveHouseholdUseCase
    readonly dissolve: DissolveHouseholdUseCase
    readonly received: ListReceivedInvitationsUseCase
    readonly accept: AcceptInvitationUseCase
    readonly decline: DeclineInvitationUseCase
  }
  readonly authenticator: IAuthenticator
  readonly limiter: RateLimiter
  readonly appUrl: string
  readonly allowedOrigins: readonly string[]
}

/**
 * Adaptateur HTTP du foyer : traduction seule, les règles sont dans l'agrégat.
 * Les routes à paramètre sont écrites en toutes lettres — le contrat, lui,
 * fabrique les chemins concrets qu'appelle le client.
 */
export function registerHouseholdRoutes(app: FastifyInstance, deps: HouseholdRoutesDependencies): void {
  const { useCases, authenticator } = deps
  const household = (view: HouseholdView | null) => ({ household: view })
  const noContent = (reply: FastifyReply) => reply.status(204).send()
  const paramId = (request: FastifyRequest): string => parseWith(idParamSchema, request.params).id

  app.get(HOUSEHOLD_ROUTE.household, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.get.execute(account)
    return result.ok ? household(result.value) : rejectWith(result.error)
  })

  app.post(HOUSEHOLD_ROUTE.household, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const { name } = parseWith(createHouseholdSchema, request.body)
    const result = await useCases.create.execute(account, name)
    return result.ok ? reply.status(201).send(household(result.value)) : rejectWith(result.error)
  })

  app.delete(HOUSEHOLD_ROUTE.household, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.dissolve.execute(account)
    return result.ok ? noContent(reply) : rejectWith(result.error)
  })

  app.post(HOUSEHOLD_ROUTE.invitations, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const { email } = parseWith(inviteSchema, request.body)
    deps.limiter.hit(`invite:account:${account.id}`, RATE.invitationsPerAccount)

    const linkBase = knownOrigin(request, deps.allowedOrigins) ?? deps.appUrl
    const result = await useCases.invite.execute(account, email, linkBase)
    if (!result.ok) rejectWith(result.error)
    return reply.status(202).send({ status: 'accepted' })
  })

  app.delete('/household/invitations/:id', async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.revoke.execute(account, idFrom<'InvitationId'>(paramId(request)))
    return result.ok ? household(result.value) : rejectWith(result.error)
  })

  app.delete('/household/members/:id', async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.removeMember.execute(account, idFrom<'AccountId'>(paramId(request)))
    return result.ok ? household(result.value) : rejectWith(result.error)
  })

  app.post(HOUSEHOLD_ROUTE.leave, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.leave.execute(account)
    return result.ok ? noContent(reply) : rejectWith(result.error)
  })

  app.put(HOUSEHOLD_ROUTE.sharing, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const { sharesDays } = parseWith(daySharingSchema, request.body)
    const result = await useCases.setDaySharing.execute(account, sharesDays)
    return result.ok ? household(result.value) : rejectWith(result.error)
  })

  app.get(HOUSEHOLD_ROUTE.received, async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.received.execute(account)
    return result.ok ? { invitations: result.value } : rejectWith(result.error)
  })

  app.post('/invitations/:id/accept', async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.accept.execute(account, idFrom<'InvitationId'>(paramId(request)))
    return result.ok ? household(result.value) : rejectWith(result.error)
  })

  app.post('/invitations/:id/decline', async (request, reply) => {
    const account = await authenticator.require(request, reply)
    const result = await useCases.decline.execute(account, idFrom<'InvitationId'>(paramId(request)))
    return result.ok ? noContent(reply) : rejectWith(result.error)
  })
}
