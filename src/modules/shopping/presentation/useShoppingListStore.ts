import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { ShoppingItemId } from '@/core/identity'

import type {
  ChosenFood,
  FillOutcome,
  GroceryDemand,
  ShoppingListRef,
  ShoppingListView,
} from '../application'

export type ShoppingStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état de la liste de courses. Comme la semaine, il relit la
 * liste après chaque modification plutôt que de la rafistoler.
 */
export const useShoppingListStore = defineStore('shoppingList', () => {
  const list = shallowRef<ShoppingListRef | null>(null)
  const view = shallowRef<ShoppingListView | null>(null)
  const status = ref<ShoppingStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const items = computed(() => view.value?.items ?? [])

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  /** Charge une liste — par défaut, celle déjà affichée. */
  async function load(target: ShoppingListRef | null = list.value): Promise<boolean> {
    if (target === null) return false
    list.value = target
    status.value = 'loading'
    const result = await useContainer().shopping.get.execute(target)
    if (!result.ok) return fail(result.error)
    view.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  async function reload(outcome: { ok: true } | { ok: false; error: BaseError }): Promise<boolean> {
    if (!outcome.ok) return fail(outcome.error)
    return load()
  }

  async function fill(demand: GroceryDemand): Promise<FillOutcome | null> {
    if (list.value === null) return null
    status.value = 'loading'
    const result = await useContainer().shopping.fill.execute(list.value, demand)
    if (!result.ok) {
      fail(result.error)
      return null
    }
    await load()
    return result.value
  }

  async function add(name: string, quantityText: string | null = null): Promise<boolean> {
    if (list.value === null) return false
    return reload(await useContainer().shopping.add.execute(list.value, name, quantityText))
  }

  async function addFood(food: ChosenFood): Promise<boolean> {
    if (list.value === null) return false
    return reload(await useContainer().shopping.addFood.execute(list.value, food))
  }

  async function setChecked(id: ShoppingItemId, checked: boolean): Promise<boolean> {
    return reload(await useContainer().shopping.check.execute(id, checked))
  }

  async function remove(ids: readonly ShoppingItemId[]): Promise<boolean> {
    return reload(await useContainer().shopping.remove.execute(ids))
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = view.value === null ? 'idle' : 'ready'
  }

  return {
    list,
    view,
    status,
    error,
    items,
    load,
    fill,
    add,
    addFood,
    setChecked,
    remove,
    clearError,
  }
})
