import { DomainError } from '@/core/errors'

/**
 * Refus du foyer. Leurs codes voyagent tels quels jusqu'au client, qui les
 * traduit : ils font partie du contrat.
 */
export class InvalidHouseholdNameError extends DomainError {
  constructor(message: string) {
    super('INVALID_HOUSEHOLD_NAME', message)
  }
}

export class NotHouseholdOwnerError extends DomainError {
  constructor() {
    super('NOT_HOUSEHOLD_OWNER', 'Seul le propriétaire du foyer peut faire cela.')
  }
}

export class AlreadyHouseholdMemberError extends DomainError {
  constructor() {
    super('ALREADY_HOUSEHOLD_MEMBER', 'Cette adresse est déjà celle d’un membre du foyer.')
  }
}

export class AlreadyInvitedError extends DomainError {
  constructor() {
    super('ALREADY_INVITED', 'Une invitation attend déjà une réponse à cette adresse.')
  }
}

export class HouseholdFullError extends DomainError {
  constructor(max: number) {
    super('HOUSEHOLD_FULL', `Un foyer compte au plus ${max} membres, invitations comprises.`)
  }
}

/**
 * Invitation inconnue, périmée, ou adressée à quelqu'un d'autre : un seul
 * refus pour les trois, qui ne dit pas qu'une invitation existe ailleurs.
 */
export class InvitationNotFoundError extends DomainError {
  constructor() {
    super('INVITATION_NOT_FOUND', 'Invitation introuvable ou expirée.')
  }
}

export class MemberNotFoundError extends DomainError {
  constructor() {
    super('MEMBER_NOT_FOUND', 'Ce compte n’est pas membre du foyer.')
  }
}

export class OwnerCannotLeaveError extends DomainError {
  constructor() {
    super('OWNER_CANNOT_LEAVE', 'Le propriétaire ne quitte pas son foyer : il le dissout.')
  }
}

/** Un compte n'appartient qu'à un foyer : il doit quitter le sien avant d'en rejoindre un autre. */
export class AlreadyInHouseholdError extends DomainError {
  constructor() {
    super('ALREADY_IN_HOUSEHOLD', 'Ce compte appartient déjà à un foyer.')
  }
}
