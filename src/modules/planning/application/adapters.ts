/**
 * Adaptation des read models des autres contextes vers les types structurels des
 * services de domaine. Toute la connaissance que `planning` a du reste de
 * l'application tient dans ce fichier — et se limite à trois DTO.
 */
import type { DailyConsumption, MealSummary } from '@/modules/nutrition_inventory/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

import type { ConsumedTotals, DailyTarget } from '../domain/MealCompletionService'
import type { BaseOn, DailyIntake } from '../domain/RecentIntakeService'

export function toDailyTarget(needs: PlayerNutritionalNeeds): DailyTarget {
  return {
    calories: needs.targetCalories,
    macros: needs.targetMacros,
    fiberG: needs.referenceNutrients.fiberG,
  }
}

export function toConsumedTotals(summaries: readonly MealSummary[]): ConsumedTotals[] {
  return summaries.map((summary) => ({
    calories: summary.calories,
    macros: summary.macros,
    fiberG: summary.detail.fiberG,
  }))
}

/**
 * Repères de chaque jour, à plat : la forme sur laquelle raisonnent les
 * moyennes. Un jour couvert par l'historique prend les besoins d'alors.
 */
export function toBaseOn(needs: PlayerNutritionalNeeds): BaseOn {
  return (day) => {
    const values = needs.history.find((snapshot) => snapshot.until >= day) ?? needs
    return {
      calories: values.targetCalories,
      ...values.targetMacros,
      ...values.referenceNutrients,
    }
  }
}

export function toDailyIntakes(history: readonly DailyConsumption[]): DailyIntake[] {
  return history.map((day) => ({
    day: day.day,
    values: { calories: day.calories, ...day.macros, ...day.detail },
  }))
}
