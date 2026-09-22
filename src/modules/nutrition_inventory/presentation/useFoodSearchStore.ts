import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'

import type { CustomFoodInput } from '../application'
import type { FoodItem } from '../domain/FoodItem'

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Adaptateur d'état de la recherche d'aliments.
 *
 * Un seul point d'entrée, `find` : c'est `FindFoodUseCase` qui décide, d'après
 * la forme de la saisie, s'il faut chercher un nom ou un code-barres, et qui
 * fusionne catalogue local et Open Food Facts. Le store ne fait que déplier son
 * résultat.
 *
 * `onlineSearchUnavailable` est exposé séparément du reste : c'est
 * l'information que l'UI doit afficher explicitement (« résultats du catalogue
 * local uniquement ») plutôt que de laisser une liste tronquée passer pour une
 * liste complète.
 */
export const useFoodSearchStore = defineStore('foodSearch', () => {
  const query = ref('')
  const results = shallowRef<readonly FoodItem[]>([])
  const searchKind = ref<'by_name' | 'by_barcode' | null>(null)
  const onlineSearched = ref(false)
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const hasResults = computed(() => results.value.length > 0)

  /** Vrai seulement après une recherche effectivement partie sans le distant. */
  const onlineSearchUnavailable = computed(
    () => status.value === 'ready' && !onlineSearched.value,
  )

  /** Un code-barres cherché partout, et introuvable partout. */
  const unknownBarcode = computed(
    () =>
      status.value === 'ready' &&
      searchKind.value === 'by_barcode' &&
      onlineSearched.value &&
      results.value.length === 0,
  )

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  /**
   * Recherche par nom **ou** par code-barres, catalogue local et distant réunis.
   *
   * Les drapeaux sont remis à zéro avant l'appel : sans cela, le bandeau
   * « recherche en ligne indisponible » d'une requête précédente survivrait à la
   * suivante et décrirait un état qui n'a plus cours.
   */
  async function find(text: string): Promise<boolean> {
    query.value = text
    status.value = 'loading'
    searchKind.value = null
    onlineSearched.value = false

    const result = await useContainer().inventory.find.execute(text)
    if (!result.ok) return fail(result.error)

    results.value = result.value.items
    searchKind.value = result.value.kind
    onlineSearched.value = result.value.onlineSearched
    error.value = null
    status.value = 'ready'
    return true
  }

  async function createCustomFood(input: CustomFoodInput): Promise<FoodItem | null> {
    status.value = 'loading'

    const result = await useContainer().inventory.createCustomFood.execute(input)
    if (!result.ok) {
      fail(result.error)
      return null
    }

    results.value = [result.value]
    error.value = null
    status.value = 'ready'
    return result.value
  }

  function reset(): void {
    query.value = ''
    results.value = []
    searchKind.value = null
    onlineSearched.value = false
    error.value = null
    status.value = 'idle'
  }

  return {
    query,
    results,
    searchKind,
    status,
    error,
    hasResults,
    onlineSearchUnavailable,
    unknownBarcode,
    find,
    createCustomFood,
    reset,
  }
})
