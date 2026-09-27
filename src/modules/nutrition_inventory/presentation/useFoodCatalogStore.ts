import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { FoodItemId, PlayerId } from '@/core/identity'

import type { CustomFoodInput } from '../application'
import type { FoodItem } from '../domain/FoodItem'

import type { StoreStatus } from './useFoodSearchStore'

/**
 * Adaptateur d'état de l'écran « Mes aliments ».
 *
 * Il ne parcourt que les aliments créés à la main — les siens comme ceux du
 * foyer. Les droits (modifier, supprimer) sont ceux de l'entité ; le store se
 * contente de relayer les Use Cases et leurs refus.
 */
export const useFoodCatalogStore = defineStore('foodCatalog', () => {
  const query = ref('')
  const items = shallowRef<readonly FoodItem[]>([])
  /** La fiche ouverte, en consultation ou en modification. */
  const current = shallowRef<FoodItem | null>(null)
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  function succeed(): true {
    error.value = null
    status.value = 'ready'
    return true
  }

  async function browse(): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.browseCustomFoods.execute(query.value)
    if (!result.ok) return fail(result.error)

    items.value = result.value
    return succeed()
  }

  async function open(id: FoodItemId): Promise<boolean> {
    status.value = 'loading'
    current.value = null
    const result = await useContainer().inventory.getFood.execute(id)
    if (!result.ok) return fail(result.error)

    current.value = result.value
    return succeed()
  }

  async function update(
    id: FoodItemId,
    input: CustomFoodInput,
    editor: PlayerId | null,
  ): Promise<FoodItem | null> {
    status.value = 'loading'
    const result = await useContainer().inventory.updateCustomFood.execute(id, input, editor)
    if (!result.ok) {
      fail(result.error)
      return null
    }
    current.value = result.value
    succeed()
    return result.value
  }

  /** Supprime la fiche et la retire de la liste affichée, sans la relire en entier. */
  async function remove(id: FoodItemId, editor: PlayerId | null): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.deleteFood.execute(id, editor)
    if (!result.ok) return fail(result.error)

    items.value = items.value.filter((item) => item.id !== id)
    if (current.value?.id === id) current.value = null
    return succeed()
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = 'ready'
  }

  return {
    query,
    items,
    current,
    status,
    error,
    browse,
    open,
    update,
    remove,
    clearError,
  }
})
