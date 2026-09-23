/**
 * Durées de vie des secrets — des règles métier, pas des réglages techniques :
 * elles fixent combien de temps un lien ou un appareil oublié ouvre le compte.
 */
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type EmailTokenPurpose = 'verify_email' | 'reset_password'

/**
 * Un jour pour confirmer une adresse ; une heure pour changer de mot de passe —
 * ce second lien ouvre le compte à qui le détient, il doit périmer vite.
 */
export const EMAIL_TOKEN_TTL_MS: Readonly<Record<EmailTokenPurpose, number>> = {
  verify_email: DAY_MS,
  reset_password: HOUR_MS,
}

/** Une session utilisée au moins une fois par mois ne s'interrompt jamais. */
export const SESSION_TTL_MS = 30 * DAY_MS

/**
 * L'échéance n'est repoussée qu'après un jour d'activité : prolonger à chaque
 * requête écrirait en base pour rien.
 */
export function shouldExtendSession(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - DAY_MS
}
