import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { MealId, PlayerId } from '@/core/identity'

import type { DailyJournal } from '../application'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état de la journée, tel que l'accueil l'affiche.
 *
 * Il ne sait que lire la journée et y cocher un repas pris : composer, corriger
 * et supprimer se font dans la semaine, par `useWeekPlanStore` et
 * `useMealEditorStore`. Deux écrans qui modifient les mêmes repas, c'est ce que
 * la suppression du journal a précisément retiré.
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
   * Marque un repas comme pris, ou revient dessus, puis relit le journal plutôt
   * que de rafistoler l'état local : recalculer les totaux ici dupliquerait
   * `Meal.calculateTotals()`.
   */
  async function setConsumed(
    playerId: PlayerId,
    mealId: MealId,
    consumed: boolean,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.markConsumed.execute(mealId, consumed)
    if (!result.ok) return fail(result.error)

    return load(playerId, day.value)
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
    setConsumed,
    clearError,
  }
})
