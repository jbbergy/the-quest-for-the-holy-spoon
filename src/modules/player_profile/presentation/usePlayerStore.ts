import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import { useContainer } from '@/app/container'

import {
  type PlayerNutritionalNeeds,
  type PlayerProfileView,
  type ProfileInput,
  type ProfileUpdate,
  toNutritionalNeeds,
  toPlayerProfileView,
} from '../application'
import type { Player } from '../domain/Player'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état du profil.
 *
 * Le store ne contient **aucune** règle métier : il appelle un Use Case, déplie
 * le `Result`, et réassigne la `ref`. Toute la logique reste dans le domaine, ce
 * qui la garde testable sans monter Vue.
 *
 * `shallowRef` et non `ref` : `Player` est immuable et remplacé en bloc à chaque
 * mise à jour. Une réactivité profonde ne servirait à rien — elle ne ferait que
 * parcourir inutilement l'entité à chaque changement — et c'est justement la
 * réassignation de la référence que les watchers GSAP observeront en phase 5.
 */
export const usePlayerStore = defineStore('player', () => {
  const player = shallowRef<Player | null>(null)
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const isReady = computed(() => status.value === 'ready')
  const playerId = computed(() => player.value?.id ?? null)

  const profileView = computed<PlayerProfileView | null>(() =>
    player.value === null ? null : toPlayerProfileView(player.value),
  )

  /** Read model consommé par `planning` — le seul que ce contexte laisse sortir. */
  const needs = computed<PlayerNutritionalNeeds | null>(() =>
    player.value === null ? null : toNutritionalNeeds(player.value),
  )

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  function succeed(next: Player | null): true {
    player.value = next
    error.value = null
    status.value = 'ready'
    return true
  }

  async function load(): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().profile.getCurrent.execute()
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  async function create(input: ProfileInput): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().profile.create.execute(input)
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  async function update(changes: ProfileUpdate): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().profile.update.execute(changes)
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = player.value === null ? 'idle' : 'ready'
  }

  return {
    player,
    status,
    error,
    isReady,
    playerId,
    profileView,
    needs,
    load,
    create,
    update,
    clearError,
  }
})
