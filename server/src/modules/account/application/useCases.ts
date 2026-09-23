import type { DomainError } from '@/core/errors'
import { type AccountId, newId, type PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'
import { Email } from '@/core/Email'
import { checkPassword } from '@/modules/account/domain/PasswordPolicy'

import { Account } from '../domain/Account'
import { PlayerAlreadyLinkedError } from '../domain/errors'
import { EMAIL_TOKEN_TTL_MS, SESSION_TTL_MS, shouldExtendSession } from '../domain/policies'
import type {
  Clock,
  IAccountNotifier,
  IAccountRepository,
  IEmailTokenStore,
  IPasswordHasher,
  ISessionStore,
} from '../domain/ports'

import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  NotAuthenticatedError,
  TokenInvalidError,
} from './errors'

export interface AccountDependencies {
  readonly accounts: IAccountRepository
  readonly sessions: ISessionStore
  readonly tokens: IEmailTokenStore
  readonly hasher: IPasswordHasher
  readonly notifier: IAccountNotifier
  readonly clock: Clock
}

/** Ce que le serveur dit d'un compte — jamais son empreinte de mot de passe. */
export interface AccountView {
  readonly id: AccountId
  readonly email: string
  readonly playerId: PlayerId | null
}

/** Session ouverte : le jeton est rendu une seule fois, pour le cookie. */
export interface SessionGrant {
  readonly account: AccountView
  readonly token: string
}

export function toAccountView(account: Account): AccountView {
  return { id: account.id, email: account.email.value, playerId: account.playerId }
}

async function grantSession(deps: AccountDependencies, account: Account): Promise<SessionGrant> {
  const expiresAt = new Date(deps.clock().getTime() + SESSION_TTL_MS)
  const token = await deps.sessions.open(account.id, expiresAt)
  return { account: toAccountView(account), token }
}

function tokenExpiry(deps: AccountDependencies, purpose: keyof typeof EMAIL_TOKEN_TTL_MS): Date {
  return new Date(deps.clock().getTime() + EMAIL_TOKEN_TTL_MS[purpose])
}

/**
 * Inscription.
 *
 * Répond **pareil** que l'adresse soit libre, en attente ou déjà confirmée :
 * seul le titulaire de l'adresse apprend, par e-mail, ce qu'il en est. Le mot
 * de passe est haché avant de savoir quelle branche suivre, pour que toutes
 * coûtent le même temps.
 */
export class SignUpUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(input: {
    readonly email: string
    readonly password: string
    readonly linkBase: string
  }): Promise<Result<void, DomainError>> {
    const email = Email.create(input.email)
    if (!email.ok) return email
    const password = checkPassword(input.password)
    if (!password.ok) return password

    const { accounts, tokens, hasher, notifier } = this.deps
    const passwordHash = await hasher.hash(password.value)
    const existing = await accounts.findByEmail(email.value)

    if (existing?.isVerified === true) {
      const token = await tokens.issue(existing.id, 'reset_password', tokenExpiry(this.deps, 'reset_password'))
      await notifier.alreadyRegistered(email.value, token, input.linkBase)
      return ok(undefined)
    }

    const pending =
      existing === null
        ? ok(Account.register({ id: newId<'AccountId'>(), email: email.value, passwordHash }))
        : existing.replacePendingPassword(passwordHash)
    if (!pending.ok) return pending

    await accounts.save(pending.value)
    const token = await tokens.issue(pending.value.id, 'verify_email', tokenExpiry(this.deps, 'verify_email'))
    await notifier.confirmAddress(email.value, token, input.linkBase)
    return ok(undefined)
  }
}

/** Confirmation de l'adresse : ouvre la session, le lien valant preuve. */
export class VerifyEmailUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(token: string): Promise<Result<SessionGrant, TokenInvalidError>> {
    const accountId = await this.deps.tokens.consume(token, 'verify_email', this.deps.clock())
    const account = accountId === null ? null : await this.deps.accounts.findById(accountId)
    if (account === null) return err(new TokenInvalidError())

    const verified = account.verifyEmail(this.deps.clock())
    await this.deps.accounts.save(verified)
    return ok(await grantSession(this.deps, verified))
  }
}

/**
 * Connexion.
 *
 * Adresse inconnue et mauvais mot de passe produisent la même erreur, dans le
 * même temps. Une adresse non confirmée n'est signalée qu'une fois le mot de
 * passe vérifié — l'information ne renseigne alors que son titulaire — et le
 * lien de confirmation repart : un premier e-mail égaré en est la cause la plus
 * probable.
 */
export class SignInUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(input: {
    readonly email: string
    readonly password: string
    readonly linkBase: string
  }): Promise<Result<SessionGrant, InvalidCredentialsError | EmailNotVerifiedError>> {
    const { accounts, hasher, tokens, notifier } = this.deps
    const email = Email.create(input.email)
    const account = email.ok ? await accounts.findByEmail(email.value) : null

    if (account === null) {
      await hasher.burn(input.password)
      return err(new InvalidCredentialsError())
    }
    if (!(await hasher.verify(account.passwordHash, input.password))) {
      return err(new InvalidCredentialsError())
    }

    if (!account.isVerified) {
      const token = await tokens.issue(account.id, 'verify_email', tokenExpiry(this.deps, 'verify_email'))
      await notifier.confirmAddress(account.email, token, input.linkBase)
      return err(new EmailNotVerifiedError())
    }

    return ok(await grantSession(this.deps, account))
  }
}

/**
 * Identifie le compte d'une session et la prolonge si elle sert encore.
 * `extended` dit au transport qu'il doit renouveler son cookie.
 */
export class AuthenticateUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(
    token: string,
  ): Promise<Result<{ readonly account: Account; readonly extended: boolean }, NotAuthenticatedError>> {
    const now = this.deps.clock()
    const session = await this.deps.sessions.find(token, now)
    const account = session === null ? null : await this.deps.accounts.findById(session.accountId)
    if (session === null || account === null) return err(new NotAuthenticatedError())

    const extended = shouldExtendSession(session.expiresAt, now)
    if (extended) {
      await this.deps.sessions.extend(token, new Date(now.getTime() + SESSION_TTL_MS))
    }
    return ok({ account, extended })
  }
}

export class SignOutUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(token: string): Promise<void> {
    await this.deps.sessions.close(token)
  }
}

/** Mot de passe oublié : muet sur l'existence du compte. */
export class RequestPasswordResetUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(input: { readonly email: string; readonly linkBase: string }): Promise<void> {
    const email = Email.create(input.email)
    const account = email.ok ? await this.deps.accounts.findByEmail(email.value) : null
    if (account === null) return

    const token = await this.deps.tokens.issue(account.id, 'reset_password', tokenExpiry(this.deps, 'reset_password'))
    await this.deps.notifier.resetPassword(account.email, token, input.linkBase)
  }
}

/**
 * Nouveau mot de passe par lien reçu.
 *
 * Toutes les sessions sont fermées — on change souvent de mot de passe parce
 * qu'on soupçonne quelqu'un de le connaître — puis une nouvelle s'ouvre pour
 * l'appareil qui a fait la demande.
 */
export class ResetPasswordUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(input: {
    readonly token: string
    readonly password: string
  }): Promise<Result<SessionGrant, DomainError | TokenInvalidError>> {
    const password = checkPassword(input.password)
    if (!password.ok) return password

    const now = this.deps.clock()
    const accountId = await this.deps.tokens.consume(input.token, 'reset_password', now)
    const account = accountId === null ? null : await this.deps.accounts.findById(accountId)
    if (account === null) return err(new TokenInvalidError())

    const updated = account.resetPassword(await this.deps.hasher.hash(password.value), now)
    await this.deps.accounts.save(updated)
    await this.deps.sessions.closeAll(updated.id)
    return ok(await grantSession(this.deps, updated))
  }
}

export class LinkPlayerUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(account: Account, playerId: PlayerId): Promise<Result<AccountView, DomainError>> {
    const linked = account.linkPlayer(playerId)
    if (!linked.ok) return linked

    if (linked.value !== account) {
      // Un profil n'appartient qu'à un compte : l'unicité traverse les
      // agrégats, c'est donc au use case — et à la contrainte d'unicité de la
      // base, en dernier recours — de la garantir.
      if (await this.deps.accounts.isPlayerTaken(playerId, account.id)) {
        return err(new PlayerAlreadyLinkedError('Ce profil est déjà rattaché à un autre compte.'))
      }
      await this.deps.accounts.save(linked.value)
    }
    return ok(toAccountView(linked.value))
  }
}

/** Suppression irréversible : le mot de passe est redemandé, une session ne suffit pas. */
export class DeleteAccountUseCase {
  constructor(private readonly deps: AccountDependencies) {}

  async execute(account: Account, password: string): Promise<Result<void, InvalidCredentialsError>> {
    if (!(await this.deps.hasher.verify(account.passwordHash, password))) {
      return err(new InvalidCredentialsError())
    }
    await this.deps.accounts.delete(account.id)
    return ok(undefined)
  }
}
