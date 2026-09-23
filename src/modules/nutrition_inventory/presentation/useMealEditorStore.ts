import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import { dayKeyOf } from '@/core/day'
import type { FoodItemId, MealEntryId, MealId, PlayerId } from '@/core/identity'

import { type MealSchedule, type MealSummary, MealType } from '../application'

import type { StoreStatus } from './useJournalStore'

/**
 * Adaptateur d'état du repas en cours de composition.
 *
 * Un repas **nouveau** n'existe d'abord que comme brouillon : un jour et un type,
 * sans rien en base. Il naît au premier aliment ajouté — ouvrir un repas puis
 * renoncer ne laisse ainsi aucune coquille vide dans la semaine. Dès lors, toute
 * modification passe par un Use Case, suivie d'une relecture du repas.
 */
export const useMealEditorStore = defineStore('mealEditor', () => {
  const meal = shallowRef<MealSummary | null>(null)
  const schedule = ref<MealSchedule>({ plannedFor: dayKeyOf(new Date()), type: MealType.LUNCH })
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const mealId = computed<MealId | null>(() => meal.value?.mealId ?? null)
  /** Un repas pris est verrouillé par le domaine : l'écran le dit avant qu'on bute dessus. */
  const isLocked = computed(() => meal.value?.consumedAt != null)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  function succeed(summary: MealSummary): true {
    meal.value = summary
    schedule.value = { plannedFor: summary.plannedFor, type: summary.type }
    error.value = null
    status.value = 'ready'
    return true
  }

  /** Commence un repas qui n'existe pas encore. */
  function startNew(next: MealSchedule): void {
    meal.value = null
    schedule.value = { ...next }
    error.value = null
    status.value = 'ready'
  }

  async function open(id: MealId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.getMeal.execute(id)
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  async function reload(id: MealId): Promise<boolean> {
    return open(id)
  }

  /**
   * Ajoute un aliment, en créant le repas s'il n'existe pas encore.
   *
   * Le Use Case rend une entité ; le store la relit aussitôt sous forme de read
   * model plutôt que de la conserver, pour que la présentation ne manipule
   * jamais d'objet capable de se modifier.
   */
  async function addFood(
    playerId: PlayerId,
    foodItemId: FoodItemId,
    grams: number,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.addFood.execute({
      playerId,
      foodItemId,
      grams,
      mealType: schedule.value.type,
      plannedFor: schedule.value.plannedFor,
      ...(mealId.value === null ? {} : { mealId: mealId.value }),
    })
    if (!result.ok) return fail(result.error)

    return reload(result.value.id)
  }

  async function removeEntry(entryId: MealEntryId): Promise<boolean> {
    const id = mealId.value
    if (id === null) return false

    status.value = 'loading'
    const result = await useContainer().inventory.removeEntry.execute(id, entryId)
    return result.ok ? reload(id) : fail(result.error)
  }

  async function changeQuantity(entryId: MealEntryId, grams: number): Promise<boolean> {
    const id = mealId.value
    if (id === null) return false

    status.value = 'loading'
    const result = await useContainer().inventory.changeQuantity.execute(id, entryId, grams)
    return result.ok ? reload(id) : fail(result.error)
  }

  /**
   * Change le jour ou le type.
   *
   * Sur un brouillon, rien n'est écrit : le choix attend le premier aliment. Sur
   * un repas existant, c'est un déplacement, que le domaine peut refuser — on
   * revient alors à la valeur enregistrée plutôt que d'afficher un choix que la
   * base n'a pas retenu.
   */
  async function reschedule(next: MealSchedule): Promise<boolean> {
    const id = mealId.value
    if (id === null) {
      schedule.value = { ...next }
      return true
    }

    status.value = 'loading'
    const result = await useContainer().inventory.reschedule.execute(id, next)
    if (!result.ok) {
      if (meal.value !== null) {
        schedule.value = { plannedFor: meal.value.plannedFor, type: meal.value.type }
      }
      return fail(result.error)
    }
    return reload(id)
  }

  async function setConsumed(consumed: boolean): Promise<boolean> {
    const id = mealId.value
    if (id === null) return false

    status.value = 'loading'
    const result = await useContainer().inventory.markConsumed.execute(id, consumed)
    return result.ok ? reload(id) : fail(result.error)
  }

  async function deleteMeal(): Promise<boolean> {
    const id = mealId.value
    if (id === null) return true

    status.value = 'loading'
    const result = await useContainer().inventory.deleteMeal.execute(id)
    if (!result.ok) return fail(result.error)

    meal.value = null
    error.value = null
    status.value = 'ready'
    return true
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = 'ready'
  }

  return {
    meal,
    schedule,
    status,
    error,
    mealId,
    isLocked,
    startNew,
    open,
    addFood,
    removeEntry,
    changeQuantity,
    reschedule,
    setConsumed,
    deleteMeal,
    clearError,
  }
})
