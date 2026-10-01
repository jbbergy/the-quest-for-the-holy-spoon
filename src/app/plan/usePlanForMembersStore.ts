import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import type { FoodItemId, MealEntryId, MealId, PlayerId } from '@/core/identity'
import type { Measure } from '@/modules/nutrition_inventory/domain/Measure'

/** Pour un membre, un aliment du repas remplacé par un autre, tel que l'écran le montre. */
export interface PlannedReplacement {
  readonly entryId: MealEntryId
  /** L'aliment remplacé : « Merguez ». */
  readonly replacedName: string
  readonly foodItemId: FoodItemId
  /** L'aliment qui le remplace : « Merguez végétales ». */
  readonly foodName: string
  readonly grams: number
  readonly measure: Measure
}

/**
 * Ce qu'on s'apprête à envoyer avec « Prévoir aussi pour… » : les membres
 * cochés, et pour chacun les aliments remplacés.
 *
 * Gardé hors de la carte parce que choisir un remplacement se fait sur un
 * autre écran, avec la recherche d'aliments : au retour, les cases cochées et
 * les remplacements déjà choisis sont toujours là. Rien n'est écrit avant
 * l'envoi ; changer de repas repart de zéro.
 */
export const usePlanForMembersStore = defineStore('planForMembers', () => {
  const mealId = ref<MealId | null>(null)
  const chosen = ref<PlayerId[]>([])
  const replacements = shallowRef<ReadonlyMap<PlayerId, readonly PlannedReplacement[]>>(new Map())

  /** Le brouillon de ce repas ; celui d'un autre repas est oublié. */
  function forMeal(id: MealId): void {
    if (mealId.value === id) return
    mealId.value = id
    clear()
  }

  function replacementsOf(playerId: PlayerId): readonly PlannedReplacement[] {
    return replacements.value.get(playerId) ?? []
  }

  /** Remplace un aliment pour un membre ; un second choix pour le même aliment l'emporte. */
  function replace(playerId: PlayerId, replacement: PlannedReplacement): void {
    const others = replacementsOf(playerId).filter((other) => other.entryId !== replacement.entryId)
    const next = new Map(replacements.value)
    next.set(playerId, [...others, replacement])
    replacements.value = next
    if (!chosen.value.includes(playerId)) chosen.value = [...chosen.value, playerId]
  }

  function cancel(playerId: PlayerId, entryId: MealEntryId): void {
    const next = new Map(replacements.value)
    next.set(
      playerId,
      replacementsOf(playerId).filter((replacement) => replacement.entryId !== entryId),
    )
    replacements.value = next
  }

  function clear(): void {
    chosen.value = []
    replacements.value = new Map()
  }

  return { mealId, chosen, replacements, forMeal, replacementsOf, replace, cancel, clear }
})
