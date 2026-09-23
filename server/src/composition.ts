import {
  type AccountDependencies,
  AuthenticateUseCase,
  DeleteAccountUseCase,
  LinkPlayerUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignInUseCase,
  SignOutUseCase,
  SignUpUseCase,
  VerifyEmailUseCase,
} from './modules/account/application/useCases'
import type { Clock } from './modules/account/domain/ports'
import { Argon2PasswordHasher } from './modules/account/infrastructure/Argon2PasswordHasher'
import { KyselyAccountRepository } from './modules/account/infrastructure/KyselyAccountRepository'
import { KyselyEmailTokenStore } from './modules/account/infrastructure/KyselyEmailTokenStore'
import { KyselySessionStore } from './modules/account/infrastructure/KyselySessionStore'
import { MailAccountNotifier } from './modules/account/infrastructure/MailAccountNotifier'
import { PullChangesUseCase, PushChangesUseCase } from './modules/sync/application/useCases'
import { KyselyRecordStore } from './modules/sync/infrastructure/KyselyRecordStore'
import type { Db } from './shared/db/database'
import type { IMailer } from './shared/mail/Mailer'

/**
 * Racine de composition du serveur — le pendant de `src/app/composition.ts`.
 *
 * C'est le seul endroit où Kysely, argon2 et le mailer sont choisis : partout
 * ailleurs, les use cases ne connaissent que des ports.
 */
export function createServerContainer(options: {
  readonly db: Db
  readonly mailer: IMailer
  readonly clock: Clock
}) {
  const deps: AccountDependencies = {
    accounts: new KyselyAccountRepository(options.db),
    sessions: new KyselySessionStore(options.db),
    tokens: new KyselyEmailTokenStore(options.db),
    hasher: new Argon2PasswordHasher(),
    notifier: new MailAccountNotifier(options.mailer),
    clock: options.clock,
  }

  const records = new KyselyRecordStore(options.db)

  return {
    sync: {
      push: new PushChangesUseCase(records),
      pull: new PullChangesUseCase(records),
    },
    account: {
      authenticate: new AuthenticateUseCase(deps),
      signUp: new SignUpUseCase(deps),
      verifyEmail: new VerifyEmailUseCase(deps),
      signIn: new SignInUseCase(deps),
      signOut: new SignOutUseCase(deps),
      requestPasswordReset: new RequestPasswordResetUseCase(deps),
      resetPassword: new ResetPasswordUseCase(deps),
      linkPlayer: new LinkPlayerUseCase(deps),
      deleteAccount: new DeleteAccountUseCase(deps),
    },
  }
}

export type ServerContainer = ReturnType<typeof createServerContainer>
