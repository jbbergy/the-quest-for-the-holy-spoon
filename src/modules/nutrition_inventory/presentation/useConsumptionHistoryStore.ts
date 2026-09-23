import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import type { DayKey } from '@/core/day'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'

import type { DailyConsumption } from '../application'

import type { StoreStatus } from './useJournalStore'

/**
 * Apports réels des jours passés.
 *
 * Le store ne sait pas pourquoi on les lui demande ni sur combien de jours :
 * c'est `planning` qui fixe la période observée, et la couche `app` qui la
 * transmet. Il se contente de lire et d'exposer ce qui a été pris.
 */
export const useConsumptionHistoryStore = defineStore('consumptionHistory', () => {
  const days = shallowRef<readonly DailyConsumption[]>([])
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  async function load(playerId: PlayerId, from: DayKey, to: DayKey): Promise<boolean> {
    status.value = 'loading'

    const result = await useContainer().inventory.history.execute(playerId, from, to)
    if (!result.ok) {
      error.value = toErrorView(result.error)
      status.value = 'error'
      return false
    }

    days.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  return { days, status, error, load }
})
