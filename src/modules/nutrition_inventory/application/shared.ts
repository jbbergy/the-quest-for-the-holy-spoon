/**
 * Ce que partagent les Use Cases de `nutrition_inventory` : le type d'erreur
 * commun, et la lecture et l'écriture d'un repas, traduites en erreurs
 * d'application.
 */
import { ApplicationError, type DomainError, type RepositoryError } from '@/core/errors'
import type { MealId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import { Meal } from '../domain/Meal'
import type { IMealRepository } from '../domain/repositories'

export type InventoryError = ApplicationError | DomainError | RepositoryError

export async function loadMeal(
  meals: IMealRepository,
  mealId: MealId,
): Promise<Result<Meal, InventoryError>> {
  const found = await meals.findById(mealId)
  if (!found.ok) {
    return err(
      new ApplicationError('MEAL_UNREADABLE', 'Le repas n’a pas pu être relu.', {
        cause: found.error,
      }),
    )
  }
  if (found.value === null) {
    return err(new ApplicationError('MEAL_NOT_FOUND', `Aucun repas ne correspond à ${mealId}.`))
  }
  return ok(found.value)
}

export async function saveMeal(
  meals: IMealRepository,
  meal: Meal,
): Promise<Result<Meal, InventoryError>> {
  const saved = await meals.save(meal)
  if (!saved.ok) {
    return err(
      new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
        cause: saved.error,
      }),
    )
  }
  return ok(meal)
}
