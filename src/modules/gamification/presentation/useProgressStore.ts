import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'

import { type PlayerProgressView, toProgressView } from '../application'
import type { PlayerProgress } from '../domain/PlayerProgress'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état de la progression.
 *
 * `levelledUp` retient si la dernière relecture a fait franchir un niveau :
 * c'est ce drapeau, et non la valeur du niveau, que la phase 5 observera pour
 * déclencher l'animation — comparer deux nombres dans un watcher raterait le cas
 * où le joueur rouvre l'application après avoir changé de niveau.
 */
export const useProgressStore = defineStore('progress', () => {
  const progress = shallowRef<PlayerProgress | null>(null)
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)
  const levelledUp = ref(false)

  const view = computed<PlayerProgressView | null>(() =>
    progress.value === null ? null : toProgressView(progress.value),
  )
  const level = computed(() => progress.value?.level.value ?? 1)
  const progressRatio = computed(() => progress.value?.level.progressRatio() ?? 0)

  async function load(playerId: PlayerId): Promise<boolean> {
    status.value = 'loading'
    const previousLevel = progress.value?.level.value ?? null

    const result = await useContainer().gamification.getProgress.execute(playerId)
    if (!result.ok) return fail(result.error)

    levelledUp.value = previousLevel !== null && result.value.level.value > previousLevel
    progress.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  /** À appeler une fois l'animation de montée de niveau jouée. */
  function acknowledgeLevelUp(): void {
    levelledUp.value = false
  }

  return {
    progress,
    status,
    error,
    levelledUp,
    view,
    level,
    progressRatio,
    load,
    acknowledgeLevelUp,
  }
})
