import { InvalidPortionError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

const MAX_GRAMS = 100_000

/**
 * Une portion, exprimée en grammes.
 *
 * Immuable et inconstructible si invalide : zéro est refusé parce qu'une ligne de
 * repas de 0 g n'a pas de sens métier — c'est une suppression, pas une portion.
 */
export class Quantity {
  private constructor(readonly grams: number) {}

  static create(grams: number): Result<Quantity, InvalidPortionError> {
    if (!Number.isFinite(grams)) {
      return err(new InvalidPortionError('La portion doit être un nombre fini.'))
    }
    if (grams <= 0) {
      return err(new InvalidPortionError(`La portion doit être strictement positive (reçu ${grams}).`))
    }
    if (grams > MAX_GRAMS) {
      return err(new InvalidPortionError(`La portion dépasse la limite de ${MAX_GRAMS} g.`))
    }
    return ok(new Quantity(grams))
  }

  /** Réhydratation depuis le stockage : la donnée est réputée déjà validée. */
  static reconstitute(grams: number): Quantity {
    return new Quantity(grams)
  }

  /** Facteur d'échelle par rapport à la base « pour 100 g » des tables nutritionnelles. */
  get ratioTo100g(): number {
    return this.grams / 100
  }

  equals(other: Quantity): boolean {
    return this.grams === other.grams
  }

  toString(): string {
    return `${this.grams} g`
  }
}
