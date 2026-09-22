import { ApplicationError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

import {
  type IdealFoodProfile,
  MealCompletionService,
} from '../domain/MealCompletionService'

import { toConsumedTotals, toDailyTarget } from './adapters'

import type { MealSummary } from '@/modules/nutrition_inventory/application'
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
