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
    super('HOUSEHOLD_CONFLICT', 'Le foyer a changé pendant la demande\u00A0: rien n’a été enregistré.')
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

/**
 * Le relais d'e-mails a refusé le message. L'invitation n'est pas gardée : la
 * personne invitée ne saurait rien d'une invitation qu'elle n'a pas reçue.
 */
export class InvitationNotSentError extends ApplicationError {
  constructor(cause: unknown) {
    super('INVITATION_NOT_SENT', 'L’e-mail d’invitation n’a pas pu partir.', { cause })
  }
}
