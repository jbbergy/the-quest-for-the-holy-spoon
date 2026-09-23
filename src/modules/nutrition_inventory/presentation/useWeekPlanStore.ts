import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import { type DayKey, dayKeyOf, startOfWeek } from '@/core/day'
import type { MealId, PlayerId } from '@/core/identity'

import type { WeekPlan } from '../application'

import type { StoreStatus } from './useJournalStore'

/**
 * Adaptateur d'état de la semaine planifiée.
 *
 * Comme le journal, il relit la semaine après chaque modification plutôt que de
 * rafistoler l'état local : les totaux par jour appartiennent au Use Case.
 */
export const useWeekPlanStore = defineStore('weekPlan', () => {
  const plan = shallowRef<WeekPlan | null>(null)
  /** Lundi de la semaine affichée. */
  const weekStart = ref<DayKey>(startOfWeek(dayKeyOf(new Date())))
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const days = computed(() => plan.value?.days ?? [])
  const isCurrentWeek = computed(
    () => weekStart.value === startOfWeek(dayKeyOf(new Date())),
  )

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  /** Charge la semaine qui contient `anyDay` — par défaut, celle déjà affichée. */
  async function load(playerId: PlayerId, anyDay: DayKey = weekStart.value): Promise<boolean> {
    status.value = 'loading'
    weekStart.value = startOfWeek(anyDay)

    const result = await useContainer().inventory.week.execute(playerId, weekStart.value)
    if (!result.ok) return fail(result.error)

    plan.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  async function setConsumed(
    playerId: PlayerId,
    mealId: MealId,
    consumed: boolean,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.markConsumed.execute(mealId, consumed)
    if (!result.ok) return fail(result.error)

    return load(playerId)
  }

  async function deleteMeal(playerId: PlayerId, mealId: MealId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.deleteMeal.execute(mealId)
    if (!result.ok) return fail(result.error)

    return load(playerId)
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = plan.value === null ? 'idle' : 'ready'
  }

  return {
    plan,
    weekStart,
    status,
    error,
    days,
    isCurrentWeek,
    load,
    setConsumed,
    deleteMeal,
    clearError,
  }
})
