import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { MealEntryId, MealId, PlayerId } from '@/core/identity'

import type { AddFoodInput, DailyJournal } from '../application'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état du journal du jour.
 *
 * Après chaque modification de repas, le journal est relu depuis les Use Cases
 * plutôt que rafistolé localement : recalculer les totaux dans le store
 * dupliquerait une règle qui vit déjà dans `Meal.calculateTotals()`, et les deux
 * finiraient par diverger.
 */
export const useJournalStore = defineStore('journal', () => {
  const journal = shallowRef<DailyJournal | null>(null)
  const day = ref<Date>(new Date())
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const meals = computed(() => journal.value?.meals ?? [])
  /** Les seuls repas qui alimentent les jauges — le tri vient du Use Case. */
  const consumedMeals = computed(() => journal.value?.consumedMeals ?? [])
  const totalCalories = computed(() => journal.value?.totalCalories ?? 0)
  const totalMacros = computed(
    () => journal.value?.totalMacros ?? { proteinG: 0, carbsG: 0, fatG: 0 },
  )
  const totalDetail = computed(
    () => journal.value?.totalDetail ?? { fiberG: 0, sugarsG: 0, saturatedFatG: 0, saltG: 0 },
  )
  const isEmpty = computed(() => meals.value.length === 0)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  async function load(playerId: PlayerId, date: Date = day.value): Promise<boolean> {
    status.value = 'loading'
    day.value = date

    const result = await useContainer().inventory.journal.execute(playerId, date)
    if (!result.ok) return fail(result.error)

    journal.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  /**
   * Relit le journal après une modification plutôt que de rafistoler l'état
   * local : recalculer les totaux ici dupliquerait `Meal.calculateTotals()`.
   *
   * Ce store ne rafraîchit **que** le journal. Répercuter le gain d'XP est du
   * ressort de la couche `app/`, seule habilitée à connaître deux contextes à
   * la fois.
   */
  async function refreshAfterChange(playerId: PlayerId): Promise<boolean> {
    return load(playerId, day.value)
  }

  async function addFood(input: AddFoodInput): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.addFood.execute(input)
    if (!result.ok) return fail(result.error)

    return refreshAfterChange(input.playerId)
  }

  async function removeEntry(
    playerId: PlayerId,
    mealId: MealId,
    entryId: MealEntryId,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.removeEntry.execute(mealId, entryId)
    if (!result.ok) return fail(result.error)

    return refreshAfterChange(playerId)
  }

  async function changeQuantity(
    playerId: PlayerId,
    mealId: MealId,
    entryId: MealEntryId,
    grams: number,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.changeQuantity.execute(mealId, entryId, grams)
    if (!result.ok) return fail(result.error)

    return refreshAfterChange(playerId)
  }

  /** Marque un repas comme pris, ou revient dessus. */
  async function setConsumed(
    playerId: PlayerId,
    mealId: MealId,
    consumed: boolean,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.markConsumed.execute(mealId, consumed)
    if (!result.ok) return fail(result.error)

    return refreshAfterChange(playerId)
  }

  async function deleteMeal(playerId: PlayerId, mealId: MealId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.deleteMeal.execute(mealId)
    if (!result.ok) return fail(result.error)

    return refreshAfterChange(playerId)
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = journal.value === null ? 'idle' : 'ready'
  }

  return {
    journal,
    day,
    status,
    error,
    meals,
    consumedMeals,
    totalCalories,
    totalMacros,
    totalDetail,
    isEmpty,
    load,
    addFood,
    removeEntry,
    changeQuantity,
    setConsumed,
    deleteMeal,
    clearError,
  }
})
