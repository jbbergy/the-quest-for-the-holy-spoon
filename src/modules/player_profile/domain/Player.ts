import { InvalidMeasurementError, InvalidPlayerError } from '@/core/errors'
import { newId, type PlayerId } from '@/core/identity'
import { KCAL_PER_GRAM, Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { type ActivityLevel, activityMultiplier } from './ActivityLevel'
import {
  BALANCED_MACRO_SPLIT,
  DAILY_FIBER_TARGET_G,
  DAILY_SALT_LIMIT_G,
  DAILY_SUGARS_LIMIT_G,
  SATURATED_FAT_ENERGY_SHARE,
} from './BalancedDiet'
import type { BodyMeasurements } from './BodyMeasurements'
import { DietaryPreferences } from './DietaryPreferences'

const MAX_NAME_LENGTH = 60

export interface PlayerProps {
  readonly id: PlayerId
  readonly name: string
  readonly measurements: BodyMeasurements
  readonly activityLevel: ActivityLevel
  readonly preferences: DietaryPreferences
}

/**
 * Le joueur : son corps, son rythme, son régime.
 *
 * Immuable — chaque mise à jour retourne un nouveau `Player`. Les autres
 * contextes n'en connaissent que le read model `PlayerNutritionalNeeds`.
 */
export class Player {
  private constructor(
    readonly id: PlayerId,
    readonly name: string,
    readonly measurements: BodyMeasurements,
    readonly activityLevel: ActivityLevel,
    readonly preferences: DietaryPreferences,
  ) {}

  static create(props: {
    readonly name: string
    readonly measurements: BodyMeasurements
    readonly activityLevel: ActivityLevel
    readonly preferences?: DietaryPreferences
    readonly id?: PlayerId
  }): Result<Player, InvalidPlayerError> {
    const name = props.name.trim()
    if (name.length === 0) {
      return err(new InvalidPlayerError('Le nom du joueur est obligatoire.'))
    }
    if (name.length > MAX_NAME_LENGTH) {
      return err(new InvalidPlayerError(`Le nom dépasse ${MAX_NAME_LENGTH} caractères.`))
    }

    return ok(
      new Player(
        props.id ?? newId<'PlayerId'>(),
        name,
        props.measurements,
        props.activityLevel,
        props.preferences ?? DietaryPreferences.none(),
      ),
    )
  }

  static reconstitute(props: PlayerProps): Player {
    return new Player(
      props.id,
      props.name,
      props.measurements,
      props.activityLevel,
      props.preferences,
    )
  }

  /** Métabolisme de base, en kcal/jour (Mifflin-St Jeor). */
  basalMetabolicRate(): number {
    return this.measurements.basalMetabolicRate()
  }

  /** Dépense énergétique totale, BMR pondéré par le niveau d'activité. */
  totalDailyEnergyExpenditure(): number {
    return this.basalMetabolicRate() * activityMultiplier(this.activityLevel)
  }

  /**
   * Cible calorique quotidienne.
   *
   * C'est exactement la dépense énergétique : l'application vise l'équilibre,
   * pas la perte ni la prise de poids. Aucun facteur ne s'applique ici, et ce
   * n'est pas un oubli — la journée est réussie quand ce qui entre correspond à
   * ce qui sort.
   */
  targetCalories(): number {
    return this.totalDailyEnergyExpenditure()
  }

  /**
   * Cible en macronutriments : la cible calorique répartie selon la référence
   * d'équilibre, puis convertie en grammes via les coefficients d'Atwater.
   */
  targetMacros(): Macros {
    const calories = this.targetCalories()
    const split = BALANCED_MACRO_SPLIT
    return Macros.reconstitute({
      proteinG: (calories * split.protein) / KCAL_PER_GRAM.protein,
      carbsG: (calories * split.carbs) / KCAL_PER_GRAM.carbs,
      fatG: (calories * split.fat) / KCAL_PER_GRAM.fat,
    })
  }

  /**
   * Repères quotidiens des quatre nutriments complémentaires.
   *
   * Un seul objet, mais **deux lectures** : `fiberG` est un apport à atteindre,
   * les trois autres sont des plafonds. Le domaine ne peut pas porter cette
   * distinction dans le type sans dupliquer le Value Object pour quatre
   * nombres ; elle est donc documentée ici et rendue explicite par
   * `NutrientGoalKind`, côté read model, là où elle change l'affichage.
   */
  referenceNutrients(): NutrientDetail {
    return NutrientDetail.reconstitute({
      fiberG: DAILY_FIBER_TARGET_G,
      sugarsG: DAILY_SUGARS_LIMIT_G,
      // Seul repère indexé sur la dépense : 12 % de l'énergie, convertis en
      // grammes par le coefficient d'Atwater des lipides.
      saturatedFatG: (this.targetCalories() * SATURATED_FAT_ENERGY_SHARE) / KCAL_PER_GRAM.fat,
      saltG: DAILY_SALT_LIMIT_G,
    })
  }

  rename(name: string): Result<Player, InvalidPlayerError> {
    return Player.create({ ...this.props(), name })
  }

  /** Pesée : l'opération la plus fréquente, d'où ce raccourci. */
  updateWeight(weightKg: number): Result<Player, InvalidMeasurementError> {
    const measurements = this.measurements.withWeight(weightKg)
    return measurements.ok ? ok(this.withMeasurements(measurements.value)) : measurements
  }

  withMeasurements(measurements: BodyMeasurements): Player {
    return new Player(
      this.id,
      this.name,
      measurements,
      this.activityLevel,
      this.preferences,
    )
  }

  withActivityLevel(activityLevel: ActivityLevel): Player {
    return new Player(
      this.id,
      this.name,
      this.measurements,
      activityLevel,
      this.preferences,
    )
  }

  withPreferences(preferences: DietaryPreferences): Player {
    return new Player(
      this.id,
      this.name,
      this.measurements,
      this.activityLevel,
      preferences,
    )
  }

  equals(other: Player): boolean {
    return this.id === other.id
  }

  private props(): PlayerProps {
    return {
      id: this.id,
      name: this.name,
      measurements: this.measurements,
      activityLevel: this.activityLevel,
      preferences: this.preferences,
    }
  }
}
