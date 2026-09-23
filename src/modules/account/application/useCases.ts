import type { DomainError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { err, type Result } from '@/core/result'

import type {
  AccountGatewayError,
  AccountSession,
  IAccountGateway,
} from '../domain/AccountGateway'
import { Email } from '@/core/Email'
import { checkPassword } from '../domain/PasswordPolicy'

export type AccountError = DomainError | AccountGatewayError

export interface CredentialsInput {
  readonly email: string
  readonly password: string
}

/**
 * Use cases des comptes.
 *
 * Ils valident localement ce que le domaine sait juger — forme de l'adresse,
 * longueur du mot de passe — avant tout appel réseau : l'erreur s'affiche
 * aussitôt, même hors connexion, et le serveur n'est sollicité que pour ce que
 * lui seul peut trancher.
 */
export class GetSessionUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  execute(): Promise<Result<AccountSession | null, AccountError>> {
    return this.gateway.currentSession()
  }
}

export class SignUpUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  async execute(input: CredentialsInput): Promise<Result<void, AccountError>> {
    const email = Email.create(input.email)
    if (!email.ok) return email
    const password = checkPassword(input.password)
    if (!password.ok) return password

    return this.gateway.signUp(email.value, password.value)
  }
}

export class VerifyEmailUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  execute(token: string): Promise<Result<AccountSession, AccountError>> {
    return this.gateway.verifyEmail(token)
  }
}

export class SignInUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  /**
   * Seule la forme de l'adresse est vérifiée ici, pas la longueur du mot de
   * passe : la politique peut avoir changé depuis l'inscription, et refuser
   * localement un ancien mot de passe valide empêcherait de se connecter.
   */
  async execute(input: CredentialsInput): Promise<Result<AccountSession, AccountError>> {
    const email = Email.create(input.email)
    if (!email.ok) return email

    return this.gateway.signIn(email.value, input.password)
  }
}

export class SignOutUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  execute(): Promise<Result<void, AccountError>> {
    return this.gateway.signOut()
  }
}

export class RequestPasswordResetUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  async execute(rawEmail: string): Promise<Result<void, AccountError>> {
    const email = Email.create(rawEmail)
    if (!email.ok) return email

    return this.gateway.requestPasswordReset(email.value)
  }
}

export class ResetPasswordUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  async execute(input: {
    readonly token: string
    readonly password: string
  }): Promise<Result<AccountSession, AccountError>> {
    const password = checkPassword(input.password)
    if (!password.ok) return err(password.error)

    return this.gateway.resetPassword(input.token, password.value)
  }
}

export class LinkPlayerUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  execute(playerId: PlayerId): Promise<Result<AccountSession, AccountError>> {
    return this.gateway.linkPlayer(playerId)
  }
}

export class DeleteAccountUseCase {
  constructor(private readonly gateway: IAccountGateway) {}

  execute(password: string): Promise<Result<void, AccountError>> {
    return this.gateway.deleteAccount(password)
  }
}
