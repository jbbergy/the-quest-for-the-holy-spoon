/**
 * Adaptation des read models des autres contextes vers les types structurels des
 * services de domaine. Toute la connaissance que `planning` a du reste de
 * l'application tient dans ce fichier — et se limite à trois DTO.
 */
import type { DailyConsumption, MealSummary } from '@/modules/nutrition_inventory/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

import type { ConsumedTotals, DailyTarget } from '../domain/MealCompletionService'
import type { DailyIntake, NutrientValues } from '../domain/RecentIntakeService'

export function toDailyTarget(needs: PlayerNutritionalNeeds): DailyTarget {
  return { calories: needs.targetCalories, macros: needs.targetMacros }
}

export function toConsumedTotals(summaries: readonly MealSummary[]): ConsumedTotals[] {
  return summaries.map((summary) => ({ calories: summary.calories, macros: summary.macros }))
}

/** Repères habituels, à plat : la forme sur laquelle raisonnent les moyennes. */
export function toNutrientBase(needs: PlayerNutritionalNeeds): NutrientValues {
  return { calories: needs.targetCalories, ...needs.targetMacros, ...needs.referenceNutrients }
}

export function toDailyIntakes(history: readonly DailyConsumption[]): DailyIntake[] {
  return history.map((day) => ({
    day: day.day,
    values: { calories: day.calories, ...day.macros, ...day.detail },
  }))
}
