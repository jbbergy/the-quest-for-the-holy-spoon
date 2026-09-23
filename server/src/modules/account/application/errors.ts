import { ApplicationError } from '@/core/errors'

/**
 * Refus prononcés par les use cases. Leurs codes sont ceux du contrat HTTP
 * (`API_ERROR`), que le client traduit.
 */
export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Adresse ou mot de passe incorrect.')
  }
}

export class EmailNotVerifiedError extends ApplicationError {
  constructor() {
    super('EMAIL_NOT_VERIFIED', 'Adresse e-mail non confirmée.')
  }
}

export class TokenInvalidError extends ApplicationError {
  constructor() {
    super('TOKEN_INVALID', 'Lien inconnu, déjà utilisé ou périmé.')
  }
}

export class NotAuthenticatedError extends ApplicationError {
  constructor() {
    super('NOT_AUTHENTICATED', 'Session absente ou expirée.')
  }
}
