import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import {
  AUTH_ROUTE,
  credentialsSchema,
  deleteAccountSchema,
  emailRequestSchema,
  linkPlayerSchema,
  resetPasswordSchema,
  type SessionResponse,
  tokenRequestSchema,
} from '@/contract/account'
import { idFrom } from '@/core/identity'

import { parseWith, rejectWith } from '../../../shared/http/errors'
import { knownOrigin } from '../../../shared/http/origin'
import { RATE, type RateLimiter } from '../../../shared/http/rateLimit'
import type {
  AccountView,
  DeleteAccountUseCase,
  LinkPlayerUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SessionGrant,
  SignInUseCase,
  SignOutUseCase,
  SignUpUseCase,
  VerifyEmailUseCase,
} from '../application/useCases'
import { toAccountView } from '../application/useCases'

import type { SessionTransport } from './authenticate'

export interface AccountRoutesDependencies {
  readonly useCases: {
    readonly signUp: SignUpUseCase
    readonly verifyEmail: VerifyEmailUseCase
    readonly signIn: SignInUseCase
    readonly signOut: SignOutUseCase
    readonly requestPasswordReset: RequestPasswordResetUseCase
    readonly resetPassword: ResetPasswordUseCase
    readonly linkPlayer: LinkPlayerUseCase
    readonly deleteAccount: DeleteAccountUseCase
  }
  readonly sessions: SessionTransport
  readonly limiter: RateLimiter
  readonly appUrl: string
  readonly allowedOrigins: readonly string[]
}

/**
 * Adaptateur HTTP des comptes.
 *
 * Une route ne fait que traduire : valider le corps (contrat Zod), freiner les
 * rafales, appeler un use case, poser ou retirer le cookie, et convertir un
 * refus en statut HTTP. Aucune règle métier ici — elles sont dans l'agrégat
 * `Account` et les use cases.
 */
export function registerAccountRoutes(app: FastifyInstance, deps: AccountRoutesDependencies): void {
  const { useCases, sessions, limiter } = deps

  /** Les liens des e-mails ramènent vers la page d'où vient la demande, si elle est connue. */
  const linkBase = (request: FastifyRequest): string =>
    knownOrigin(request, deps.allowedOrigins) ?? deps.appUrl

  const respond = (view: AccountView): SessionResponse => ({ account: view })

  const openSession = (reply: FastifyReply, grant: SessionGrant): SessionResponse => {
    sessions.grant(reply, grant.token)
    return respond(grant.account)
  }

  app.get(AUTH_ROUTE.session, async (request, reply): Promise<SessionResponse> => {
    const account = await sessions.current(request, reply)
    return account === null ? { account: null } : respond(toAccountView(account))
  })

  app.post(AUTH_ROUTE.signUp, async (request, reply) => {
    const body = parseWith(credentialsSchema, request.body)
    limiter.hit(`mail:ip:${request.ip}`, RATE.mailPerIp)
    limiter.hit(`mail:email:${body.email.trim().toLowerCase()}`, RATE.mailPerEmail)

    const result = await useCases.signUp.execute({ ...body, linkBase: linkBase(request) })
    if (!result.ok) rejectWith(result.error)
    return reply.status(202).send({ status: 'accepted' })
  })

  app.post(AUTH_ROUTE.verifyEmail, async (request, reply): Promise<SessionResponse> => {
    const { token } = parseWith(tokenRequestSchema, request.body)
    limiter.hit(`token:ip:${request.ip}`, RATE.tokenPerIp)

    const result = await useCases.verifyEmail.execute(token)
    return result.ok ? openSession(reply, result.value) : rejectWith(result.error)
  })

  app.post(AUTH_ROUTE.signIn, async (request, reply): Promise<SessionResponse> => {
    const body = parseWith(credentialsSchema, request.body)
    limiter.hit(`login:ip:${request.ip}`, RATE.signInPerIp)
    limiter.hit(`login:email:${body.email.trim().toLowerCase()}`, RATE.signInPerEmail)

    const result = await useCases.signIn.execute({ ...body, linkBase: linkBase(request) })
    return result.ok ? openSession(reply, result.value) : rejectWith(result.error)
  })

  app.post(AUTH_ROUTE.signOut, async (request, reply) => {
    const token = sessions.tokenOf(request)
    if (token !== null) await useCases.signOut.execute(token)
    sessions.revoke(reply)
    return reply.status(204).send()
  })

  app.post(AUTH_ROUTE.forgotPassword, async (request, reply) => {
    const { email } = parseWith(emailRequestSchema, request.body)
    limiter.hit(`mail:ip:${request.ip}`, RATE.mailPerIp)
    limiter.hit(`mail:email:${email.trim().toLowerCase()}`, RATE.mailPerEmail)

    await useCases.requestPasswordReset.execute({ email, linkBase: linkBase(request) })
    return reply.status(202).send({ status: 'accepted' })
  })

  app.post(AUTH_ROUTE.resetPassword, async (request, reply): Promise<SessionResponse> => {
    const body = parseWith(resetPasswordSchema, request.body)
    limiter.hit(`token:ip:${request.ip}`, RATE.tokenPerIp)

    const result = await useCases.resetPassword.execute(body)
    return result.ok ? openSession(reply, result.value) : rejectWith(result.error)
  })

  app.put(AUTH_ROUTE.linkPlayer, async (request, reply): Promise<SessionResponse> => {
    const account = await sessions.require(request, reply)
    const { playerId } = parseWith(linkPlayerSchema, request.body)

    const result = await useCases.linkPlayer.execute(account, idFrom<'PlayerId'>(playerId))
    return result.ok ? respond(result.value) : rejectWith(result.error)
  })

  app.delete(AUTH_ROUTE.account, async (request, reply) => {
    const account = await sessions.require(request, reply)
    const { password } = parseWith(deleteAccountSchema, request.body)

    const result = await useCases.deleteAccount.execute(account, password)
    if (!result.ok) rejectWith(result.error)
    sessions.revoke(reply)
    return reply.status(204).send()
  })
}
