import { ApplicationError } from '@/core/errors'

/**
 * Refus prononcés par les use cases du foyer. Leurs codes sont ceux du
 * contrat HTTP (`API_ERROR`).
 */
export class NoHouseholdError extends ApplicationError {
  constructor() {
    super('NO_HOUSEHOLD', 'Ce compte n’appartient à aucun foyer.')
  }
}

export class HouseholdConflictError extends ApplicationError {
  constructor() {
    super('HOUSEHOLD_CONFLICT', 'Le foyer a changé pendant la demande : rien n’a été enregistré.')
  }
}

/**
 * Le foyer repose sur l'adresse : sans preuve qu'elle appartient au compte,
 * n'importe qui créerait un compte à l'adresse d'autrui et accepterait ses
 * invitations.
 */
export class HouseholdEmailNotVerifiedError extends ApplicationError {
  constructor() {
    super('EMAIL_NOT_VERIFIED', 'Adresse e-mail non confirmée.')
  }
}
