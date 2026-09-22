/**
 * Façade publique de `player_profile`.
 *
 * `planning` ne voit du joueur que `PlayerNutritionalNeeds` : ni son corps, ni
 * son nom, ni l'entité `Player`. C'est ce qui garantit qu'un changement de
 * modèle physiologique ne se propage pas dans le moteur de recommandation.
 */
import type { PlayerId } from '@/core/identity'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'

import type { ActivityLevel } from '../domain/ActivityLevel'
import type { BiologicalSex } from '../domain/BodyMeasurements'
import type { DietaryRestriction } from '../domain/DietaryPreferences'
import type { Player } from '../domain/Player'

export interface PlayerNutritionalNeeds {
  readonly playerId: PlayerId
  readonly targetCalories: number
  readonly targetMacros: MacrosProps
  /**
   * Repères des nutriments complémentaires.
   *
   * `fiberG` est un apport à atteindre ; `sugarsG`, `saturatedFatG` et `saltG`
   * sont des plafonds. `planning` ne s'en sert pas aujourd'hui — sa suggestion
   * reste calorique et macronutritionnelle — mais la valeur voyage avec les
   * besoins plutôt que d'être recalculée par chaque écran.
   */
  readonly referenceNutrients: NutrientDetailProps
  readonly restrictions: readonly DietaryRestriction[]
  readonly allergens: readonly string[]
}

export function toNutritionalNeeds(player: Player): PlayerNutritionalNeeds {
  return {
    playerId: player.id,
    targetCalories: player.targetCalories(),
    targetMacros: player.targetMacros().toJSON(),
    referenceNutrients: player.referenceNutrients().toJSON(),
    restrictions: [...player.preferences.restrictions],
    allergens: [...player.preferences.allergens],
  }
}

/** Read model d'affichage du profil, pour la couche présentation. */
export interface PlayerProfileView {
  readonly playerId: PlayerId
  readonly name: string
  readonly basalMetabolicRate: number
  readonly totalDailyEnergyExpenditure: number
  readonly targetCalories: number
  readonly targetMacros: MacrosProps
  readonly referenceNutrients: NutrientDetailProps
}

export {
  CreatePlayerProfileUseCase,
  GetCurrentPlayerUseCase,
  UpdatePlayerProfileUseCase,
  type ProfileError,
  type ProfileInput,
  type ProfileUpdate,
} from './useCases'

export function toPlayerProfileView(player: Player): PlayerProfileView {
  return {
    playerId: player.id,
    name: player.name,
    basalMetabolicRate: player.basalMetabolicRate(),
    totalDailyEnergyExpenditure: player.totalDailyEnergyExpenditure(),
    targetCalories: player.targetCalories(),
    targetMacros: player.targetMacros().toJSON(),
    referenceNutrients: player.referenceNutrients().toJSON(),
  }
}

/**
 * Vue d'export du profil.
 *
 * Elle passe par l'entité `Player`, jamais par l'enregistrement stocké, et ce
 * n'est pas un détail : les profils écrits avant le retrait des objectifs de
 * transformation corporelle portent encore un champ `goal` orphelin en base.
 * Exporter l'enregistrement brut le ressusciterait dans un fichier que
 * l'utilisateur garde ; le faire transiter par le domaine l'élimine, puisque
 * `Player` ne connaît plus cette notion. (Le champ disparaît de la base de
 * lui-même au premier enregistrement du profil, `put` remplaçant l'objet entier.)
 */
export interface PlayerExport {
  readonly name: string
  readonly heightCm: number
  readonly weightKg: number
  readonly ageYears: number
  readonly biologicalSex: BiologicalSex
  readonly activityLevel: ActivityLevel
  readonly restrictions: readonly DietaryRestriction[]
  readonly allergens: readonly string[]
  /** Recalculés à l'export : ils situent l'historique sans être une donnée stockée. */
  readonly basalMetabolicRate: number
  readonly totalDailyEnergyExpenditure: number
  readonly targetCalories: number
  readonly targetMacros: MacrosProps
  readonly referenceNutrients: NutrientDetailProps
}

export function toPlayerExport(player: Player): PlayerExport {
  return {
    name: player.name,
    heightCm: player.measurements.heightCm,
    weightKg: player.measurements.weightKg,
    ageYears: player.measurements.ageYears,
    biologicalSex: player.measurements.biologicalSex,
    activityLevel: player.activityLevel,
    restrictions: [...player.preferences.restrictions],
    allergens: [...player.preferences.allergens],
    basalMetabolicRate: player.basalMetabolicRate(),
    totalDailyEnergyExpenditure: player.totalDailyEnergyExpenditure(),
    targetCalories: player.targetCalories(),
    targetMacros: player.targetMacros().toJSON(),
    referenceNutrients: player.referenceNutrients().toJSON(),
  }
}
