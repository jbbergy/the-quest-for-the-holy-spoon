import { ApplicationError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

import { addDays, type DayKey } from '@/core/day'

import {
  type IdealFoodProfile,
  MealCompletionService,
} from '../domain/MealCompletionService'
import { RECENT_DAYS, type RecentIntake, RecentIntakeService } from '../domain/RecentIntakeService'

import { toConsumedTotals, toDailyIntakes, toDailyTarget, toNutrientBase } from './adapters'

import type { DailyConsumption, MealSummary } from '@/modules/nutrition_inventory/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

export type PlanningError = ApplicationError

/**
 * Détermine ce qu'il manque au joueur pour boucler sa journée.
 *
 * Le Use Case ne lit rien lui-même : il reçoit les read models des deux autres
 * contextes, déjà chargés par la couche présentation. C'est ce qui le rend
 * synchrone, pur et testable par simple table de cas — et ce qui empêche
 * `planning` d'acquérir une dépendance vers les repositories d'autrui.
 */
export class SuggestMealCompletionUseCase {
  execute(
    needs: PlayerNutritionalNeeds,
    consumed: readonly MealSummary[],
  ): Result<IdealFoodProfile, PlanningError> {
    const profile = MealCompletionService.computeMissing(
      toDailyTarget(needs),
      toConsumedTotals(consumed),
    )

    if (!profile.ok) {
      return err(
        new ApplicationError(
          'COMPLETION_NOT_COMPUTABLE',
          'Le profil de complétion n’a pas pu être calculé.',
          { cause: profile.error },
        ),
      )
    }

    return ok(profile.value)
  }
}

/**
 * Jours dont l'historique est nécessaire pour les moyennes de `day`.
 *
 * Exposé plutôt que laissé à l'appelant : la période observée est une règle de
 * `planning`, et l'écran qui charge l'historique n'a pas à la connaître.
 */
export function recentWindow(day: DayKey): { readonly from: DayKey; readonly to: DayKey } {
  return { from: addDays(day, -RECENT_DAYS), to: addDays(day, -1) }
}

/**
 * Apports moyens des sept jours précédents, face aux repères habituels.
 *
 * Synchrone et sans lecture, comme la suggestion : l'historique arrive déjà
 * chargé par `nutrition_inventory`, sous forme de read model. Les objectifs du
 * jour n'en dépendent pas — la moyenne se regarde, elle ne se rattrape pas.
 */
export class SummarizeRecentIntakeUseCase {
  execute(
    needs: PlayerNutritionalNeeds,
    history: readonly DailyConsumption[],
    day: DayKey,
  ): Result<RecentIntake, PlanningError> {
    const recent = RecentIntakeService.summarize(
      day,
      toNutrientBase(needs),
      toDailyIntakes(history),
    )

    if (!recent.ok) {
      return err(
        new ApplicationError(
          'RECENT_INTAKE_NOT_COMPUTABLE',
          'Les moyennes de la semaine n’ont pas pu être calculées.',
          { cause: recent.error },
        ),
      )
    }

    return ok(recent.value)
  }
}
