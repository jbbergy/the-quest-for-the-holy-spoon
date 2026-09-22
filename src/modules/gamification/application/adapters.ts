/**
 * Traduction du vocabulaire de `nutrition_inventory` vers celui de ce module.
 *
 * C'est ici — et nulle part dans le domaine — que le payload d'événement est
 * converti. L'adaptation est volontairement triviale : si les deux formes
 * divergent un jour, c'est ce seul fichier qui change, et le barème d'XP reste
 * testable sans qu'aucun objet du contexte nutrition n'ait besoin d'exister.
 */
import type { MealLoggedPayload } from '@/modules/nutrition_inventory/application'

import type { MealLoggedFacts } from '../domain/XpRewardPolicy'

export function toMealLoggedFacts(payload: MealLoggedPayload): MealLoggedFacts {
  return {
    entryCount: payload.entryCount,
    calories: payload.calories,
    macros: payload.macros,
  }
}
