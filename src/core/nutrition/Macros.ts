import { InvalidMacrosError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/** Coefficients d'Atwater : kcal par gramme de macronutriment. */
export const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const

export interface MacrosProps {
  readonly proteinG: number
  readonly carbsG: number
  readonly fatG: number
}

/**
 * Un triplet de macronutriments, en grammes.
 *
 * Value Object du Shared Kernel : `nutrition_inventory` le produit, `player_profile`
 * exprime ses cibles avec, `planning` les compare. Centraliser le calcul calorique
 * ici évite trois implémentations qui divergeraient sur les arrondis.
 */
export class Macros {
  private constructor(
    readonly proteinG: number,
    readonly carbsG: number,
    readonly fatG: number,
  ) {}

  static create(props: MacrosProps): Result<Macros, InvalidMacrosError> {
    const entries: readonly [string, number][] = [
      ['protéines', props.proteinG],
      ['glucides', props.carbsG],
      ['lipides', props.fatG],
    ]
    for (const [label, value] of entries) {
      if (!Number.isFinite(value)) {
        return err(new InvalidMacrosError(`Les ${label} doivent être un nombre fini.`))
      }
      if (value < 0) {
        return err(new InvalidMacrosError(`Les ${label} ne peuvent pas être négatives (reçu ${value}).`))
      }
    }
    return ok(new Macros(props.proteinG, props.carbsG, props.fatG))
  }

  static reconstitute(props: MacrosProps): Macros {
    return new Macros(props.proteinG, props.carbsG, props.fatG)
  }

  static zero(): Macros {
    return new Macros(0, 0, 0)
  }

  /** Énergie correspondante, en kcal. */
  calories(): number {
    return (
      this.proteinG * KCAL_PER_GRAM.protein +
      this.carbsG * KCAL_PER_GRAM.carbs +
      this.fatG * KCAL_PER_GRAM.fat
    )
  }

  /** Mise à l'échelle, par exemple d'une base 100 g vers une portion réelle. */
  scale(factor: number): Result<Macros, InvalidMacrosError> {
    if (!Number.isFinite(factor) || factor < 0) {
      return err(new InvalidMacrosError(`Facteur d’échelle invalide : ${factor}.`))
    }
    return ok(new Macros(this.proteinG * factor, this.carbsG * factor, this.fatG * factor))
  }

  plus(other: Macros): Macros {
    return new Macros(
      this.proteinG + other.proteinG,
      this.carbsG + other.carbsG,
      this.fatG + other.fatG,
    )
  }

  /**
   * Soustraction bornée à zéro : un « reste à consommer » négatif n'a pas de sens,
   * le dépassement se lit sur un autre axe (cf. `MealCompletionService`).
   */
  minus(other: Macros): Macros {
    return new Macros(
      Math.max(0, this.proteinG - other.proteinG),
      Math.max(0, this.carbsG - other.carbsG),
      Math.max(0, this.fatG - other.fatG),
    )
  }

  isZero(): boolean {
    return this.proteinG === 0 && this.carbsG === 0 && this.fatG === 0
  }

  equals(other: Macros): boolean {
    return (
      this.proteinG === other.proteinG &&
      this.carbsG === other.carbsG &&
      this.fatG === other.fatG
    )
  }

  toJSON(): MacrosProps {
    return { proteinG: this.proteinG, carbsG: this.carbsG, fatG: this.fatG }
  }
}
