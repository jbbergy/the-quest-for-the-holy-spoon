/**
 * Façade publique de `account`.
 *
 * Les autres contextes ne voient du compte que sa session : qui est connecté,
 * et à quel profil il est rattaché. Mot de passe et jetons ne quittent jamais
 * ce module — ni même le transport HTTP.
 */
export type { AccountSession } from '../domain/AccountGateway'
export {
  type AccountError,
  type CredentialsInput,
  DeleteAccountUseCase,
  GetSessionUseCase,
  LinkPlayerUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignInUseCase,
  SignOutUseCase,
  SignUpUseCase,
  VerifyEmailUseCase,
} from './useCases'
