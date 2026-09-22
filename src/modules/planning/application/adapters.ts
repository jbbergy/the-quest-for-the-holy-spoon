/**
 * Adaptation des read models des autres contextes vers les types structurels du
 * service de domaine. Toute la connaissance que `planning` a du reste de
 * l'application tient dans ce fichier — et se limite à deux DTO.
 */
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

import type { ConsumedTotals, DailyTarget } from '../domain/MealCompletionService'

export function toDailyTarget(needs: PlayerNutritionalNeeds): DailyTarget {
  return { calories: needs.targetCalories, macros: needs.targetMacros }
}

export function toConsumedTotals(summaries: readonly MealSummary[]): ConsumedTotals[] {
  return summaries.map((summary) => ({ calories: summary.calories, macros: summary.macros }))
}
