import { InvalidEmailError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/** Limite de la RFC 5321 pour un chemin d'adresse complet. */
export const EMAIL_MAX_LENGTH = 254

/**
 * Forme minimale d'une adresse : quelque chose, une arobase, un domaine avec un
 * point. Valider davantage rejetterait des adresses légitimes (la grammaire de
 * la RFC 5322 est bien plus permissive qu'on ne le croit) sans rien garantir :
 * seul le lien de confirmation prouve qu'une adresse existe et appartient à
 * quelqu'un.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/**
 * Adresse e-mail normalisée.
 *
 * C'est l'identifiant de connexion et la clé des invitations au foyer : deux
 * saisies d'une même adresse doivent être égales. D'où la mise en minuscules de
 * l'adresse entière — la partie locale est en théorie sensible à la casse, mais
 * aucun fournisseur courant ne l'applique, alors que « Camille@… » et
 * « camille@… » tenus pour deux comptes seraient un vrai piège.
 */
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Email, InvalidEmailError> {
    const normalized = raw.trim().toLowerCase()

    if (normalized.length === 0) {
      return err(new InvalidEmailError('Adresse e-mail vide.'))
    }
    if (normalized.length > EMAIL_MAX_LENGTH) {
      return err(new InvalidEmailError(`Adresse e-mail de plus de ${EMAIL_MAX_LENGTH} caractères.`))
    }
    if (!EMAIL_SHAPE.test(normalized)) {
      return err(new InvalidEmailError(`Adresse e-mail mal formée : ${normalized}`))
    }
    return ok(new Email(normalized))
  }

  /** Réhydratation d'une adresse déjà validée (base, réponse du serveur). */
  static reconstitute(value: string): Email {
    return new Email(value)
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
