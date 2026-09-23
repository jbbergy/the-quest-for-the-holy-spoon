import { WeakPasswordError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Politique de mot de passe, alignée sur la NIST SP 800-63B.
 *
 * Seule la **longueur** compte : les règles de composition (une majuscule, un
 * chiffre, un symbole) produisent des « Motdepasse1! » et font oublier le mot de
 * passe sans le rendre plus sûr. Une phrase de passe de quatre mots est à la
 * fois plus longue et plus facile à retenir.
 *
 * Le maximum n'existe que pour borner le coût du hachage côté serveur.
 */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

/** Longueur en caractères perçus, pas en unités UTF-16 : « é » compte pour un. */
export function passwordLength(password: string): number {
  return [...password.normalize('NFC')].length
}

export function checkPassword(password: string): Result<string, WeakPasswordError> {
  const length = passwordLength(password)

  if (length < PASSWORD_MIN_LENGTH) {
    return err(
      new WeakPasswordError(`Mot de passe de ${length} caractères, ${PASSWORD_MIN_LENGTH} requis.`),
    )
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return err(
      new WeakPasswordError(`Mot de passe de plus de ${PASSWORD_MAX_LENGTH} caractères.`),
    )
  }
  return ok(password)
}
