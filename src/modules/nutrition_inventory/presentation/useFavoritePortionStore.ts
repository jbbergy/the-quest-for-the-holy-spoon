import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'

import type { FavoritePortionInput, FavoritePortionsByFood } from '../application'

import type { StoreStatus } from './useJournalStore'

/**
 * Adaptateur d'état des portions favorites du joueur.
 *
 * Toutes chargées d'un coup, à l'ouverture de l'éditeur de repas ; garder ou
 * retirer une portion relit la liste, qui reste ainsi celle de la base.
 */
export const useFavoritePortionStore = defineStore('favoritePortions', () => {
  const portions = shallowRef<FavoritePortionsByFood>(new Map())
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  async function load(playerId: PlayerId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.listFavoritePortions.execute(playerId)
    if (!result.ok) return fail(result.error)

    portions.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  async function add(portion: FavoritePortionInput): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.addFavoritePortion.execute(portion)
    return result.ok ? load(portion.playerId) : fail(result.error)
  }

  async function remove(portion: FavoritePortionInput): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.removeFavoritePortion.execute(portion)
    return result.ok ? load(portion.playerId) : fail(result.error)
  }

  return { portions, status, error, load, add, remove }
})
