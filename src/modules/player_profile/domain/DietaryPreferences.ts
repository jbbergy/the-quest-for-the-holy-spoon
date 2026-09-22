import { IncompatibleDietaryRestrictionError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

export const DietaryRestriction = {
  GLUTEN_FREE: 'GLUTEN_FREE',
  LACTOSE_FREE: 'LACTOSE_FREE',
  VEGETARIAN: 'VEGETARIAN',
  VEGAN: 'VEGAN',
  PESCATARIAN: 'PESCATARIAN',
} as const
export type DietaryRestriction = (typeof DietaryRestriction)[keyof typeof DietaryRestriction]

/**
 * Paires mutuellement exclusives. Un pescétarien mange du poisson, un végan non :
 * accepter les deux produirait des recommandations contradictoires.
 */
const INCOMPATIBILITIES: readonly (readonly [DietaryRestriction, DietaryRestriction])[] = [
  [DietaryRestriction.VEGAN, DietaryRestriction.PESCATARIAN],
  [DietaryRestriction.VEGETARIAN, DietaryRestriction.PESCATARIAN],
]

const MAX_ALLERGENS = 50

export interface DietaryPreferencesProps {
  readonly restrictions: readonly DietaryRestriction[]
  readonly allergens: readonly string[]
}

/**
 * Régime et allergies du joueur. Immuable : `with`/`without` retournent une
 * nouvelle instance, revalidée.
 */
export class DietaryPreferences {
  private constructor(
    readonly restrictions: readonly DietaryRestriction[],
    readonly allergens: readonly string[],
  ) {}

  static create(
    props: Partial<DietaryPreferencesProps> = {},
  ): Result<DietaryPreferences, IncompatibleDietaryRestrictionError> {
    const restrictions = [...new Set(props.restrictions ?? [])].sort()

    for (const [a, b] of INCOMPATIBILITIES) {
      if (restrictions.includes(a) && restrictions.includes(b)) {
        return err(
          new IncompatibleDietaryRestrictionError(
            `Les restrictions ${a} et ${b} sont incompatibles.`,
          ),
        )
      }
    }

    const allergens = [
      ...new Set(
        (props.allergens ?? [])
          .map((allergen) => allergen.trim().toLocaleLowerCase('fr-FR'))
          .filter((allergen) => allergen.length > 0),
      ),
    ].sort()

    if (allergens.length > MAX_ALLERGENS) {
      return err(
        new IncompatibleDietaryRestrictionError(
          `Au-delà de ${MAX_ALLERGENS} allergènes, la saisie est probablement erronée.`,
        ),
      )
    }

    return ok(new DietaryPreferences(Object.freeze(restrictions), Object.freeze(allergens)))
  }

  static none(): DietaryPreferences {
    return new DietaryPreferences(Object.freeze([]), Object.freeze([]))
  }

  static reconstitute(props: DietaryPreferencesProps): DietaryPreferences {
    return new DietaryPreferences(
      Object.freeze([...props.restrictions]),
      Object.freeze([...props.allergens]),
    )
  }

  has(restriction: DietaryRestriction): boolean {
    return this.restrictions.includes(restriction)
  }

  isAllergicTo(allergen: string): boolean {
    return this.allergens.includes(allergen.trim().toLocaleLowerCase('fr-FR'))
  }

  get isEmpty(): boolean {
    return this.restrictions.length === 0 && this.allergens.length === 0
  }

  with(
    restriction: DietaryRestriction,
  ): Result<DietaryPreferences, IncompatibleDietaryRestrictionError> {
    return DietaryPreferences.create({
      restrictions: [...this.restrictions, restriction],
      allergens: this.allergens,
    })
  }

  without(restriction: DietaryRestriction): DietaryPreferences {
    return new DietaryPreferences(
      Object.freeze(this.restrictions.filter((r) => r !== restriction)),
      this.allergens,
    )
  }

  withAllergen(
    allergen: string,
  ): Result<DietaryPreferences, IncompatibleDietaryRestrictionError> {
    return DietaryPreferences.create({
      restrictions: this.restrictions,
      allergens: [...this.allergens, allergen],
    })
  }

  equals(other: DietaryPreferences): boolean {
    return (
      this.restrictions.length === other.restrictions.length &&
      this.allergens.length === other.allergens.length &&
      this.restrictions.every((r, i) => r === other.restrictions[i]) &&
      this.allergens.every((a, i) => a === other.allergens[i])
    )
  }

  toJSON(): DietaryPreferencesProps {
    return { restrictions: [...this.restrictions], allergens: [...this.allergens] }
  }
}
