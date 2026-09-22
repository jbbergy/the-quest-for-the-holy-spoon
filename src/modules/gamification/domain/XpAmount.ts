import { InvalidXpAmountError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

const MAX_SINGLE_AWARD = 100_000

/**
 * Une quantité d'expérience, toujours entière et positive ou nulle.
 *
 * Entière parce qu'un demi-point d'XP n'a pas de sens à l'affichage et que les
 * arrondis flottants feraient dériver les seuils de niveau au fil des milliers
 * d'additions.
 */
export class XpAmount {
  private constructor(readonly value: number) {}

  static create(value: number): Result<XpAmount, InvalidXpAmountError> {
    if (!Number.isFinite(value)) {
      return err(new InvalidXpAmountError('L’XP doit être un nombre fini.'))
    }
    if (!Number.isInteger(value)) {
      return err(new InvalidXpAmountError(`L’XP doit être un entier (reçu ${value}).`))
    }
    if (value < 0) {
      return err(new InvalidXpAmountError(`L’XP ne peut pas être négative (reçu ${value}).`))
    }
    if (value > MAX_SINGLE_AWARD) {
      return err(new InvalidXpAmountError(`Un gain unique ne peut pas dépasser ${MAX_SINGLE_AWARD}.`))
    }
    return ok(new XpAmount(value))
  }

  static reconstitute(value: number): XpAmount {
    return new XpAmount(value)
  }

  static zero(): XpAmount {
    return new XpAmount(0)
  }

  plus(other: XpAmount): XpAmount {
    return new XpAmount(this.value + other.value)
  }

  get isZero(): boolean {
    return this.value === 0
  }

  equals(other: XpAmount): boolean {
    return this.value === other.value
  }
}
