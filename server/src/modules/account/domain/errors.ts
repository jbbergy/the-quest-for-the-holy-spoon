import { DomainError } from '@/core/errors'

export class PlayerAlreadyLinkedError extends DomainError {
  constructor(message: string) {
    super('PLAYER_ALREADY_LINKED', message)
  }
}

export class AccountAlreadyVerifiedError extends DomainError {
  constructor() {
    super('ACCOUNT_ALREADY_VERIFIED', 'Adresse déjà confirmée\u00A0: son mot de passe ne se remplace plus par une inscription.')
  }
}
