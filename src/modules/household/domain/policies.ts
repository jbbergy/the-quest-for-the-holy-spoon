import { err, ok, type Result } from '@/core/result'

import { InvalidHouseholdNameError } from './errors'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Un foyer, c'est une maisonnée : au-delà d'une douzaine de personnes, ce
 * n'en est plus une, et la consultation des journées de chacun deviendrait une
 * surveillance de groupe.
 */
export const MAX_MEMBERS = 12

/**
 * Deux semaines pour répondre : assez pour une personne qui ouvre rarement ses
 * e-mails, pas assez pour qu'une invitation oubliée ouvre le foyer des mois
 * plus tard à qui aurait repris l'adresse.
 */
export const INVITATION_TTL_MS = 14 * DAY_MS

export const HOUSEHOLD_NAME_MAX_LENGTH = 60

/** Nom du foyer, sans les espaces de bord. */
export function checkHouseholdName(raw: string): Result<string, InvalidHouseholdNameError> {
  const name = raw.trim()
  if (name.length === 0) return err(new InvalidHouseholdNameError('Nom du foyer vide.'))
  if (name.length > HOUSEHOLD_NAME_MAX_LENGTH) {
    return err(
      new InvalidHouseholdNameError(
        `Nom du foyer de plus de ${HOUSEHOLD_NAME_MAX_LENGTH} caractères.`,
      ),
    )
  }
  return ok(name)
}
