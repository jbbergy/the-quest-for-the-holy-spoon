import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { MealId, PlayerId, RecipeId } from '@/core/identity'

import type { RecipeSummary } from '../application'

import type { StoreStatus } from './useJournalStore'

/**
 * Adaptateur d'état des recettes du joueur : la liste, la recette ouverte, et
 * les gestes qui les changent. Ajouter une recette à un repas passe par
 * `useMealEditorStore`, qui relit le repas ensuite.
 */
export const useRecipeStore = defineStore('recipes', () => {
  const recipes = shallowRef<readonly RecipeSummary[]>([])
  /** La recette ouverte sur sa fiche, `null` si elle n'existe plus. */
  const current = shallowRef<RecipeSummary | null>(null)
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  async function load(playerId: PlayerId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.listRecipes.execute(playerId)
    if (!result.ok) return fail(result.error)

    recipes.value = result.value
    error.value = null
    status.value = 'ready'
    return true
  }

  function succeed(recipe: RecipeSummary): true {
    current.value = recipe
    error.value = null
    status.value = 'ready'
    return true
  }

  /** Garde les aliments d'un repas comme recette. Rend la recette créée, ou `null`. */
  async function saveMeal(
    playerId: PlayerId,
    mealId: MealId,
    name: string,
  ): Promise<RecipeSummary | null> {
    status.value = 'loading'
    const result = await useContainer().inventory.saveAsRecipe.execute(mealId, name)
    if (!result.ok) {
      fail(result.error)
      return null
    }
    await load(playerId)
    return result.value
  }

  async function remove(playerId: PlayerId, id: RecipeId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.deleteRecipe.execute(id)
    return result.ok ? load(playerId) : fail(result.error)
  }

  async function open(id: RecipeId): Promise<boolean> {
    status.value = 'loading'
    current.value = null
    const result = await useContainer().inventory.getRecipe.execute(id)
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  /** Applique un geste sur la recette ouverte et garde la version qui en résulte. */
  async function change(
    gesture: Promise<{ ok: true; value: RecipeSummary } | { ok: false; error: BaseError }>,
  ): Promise<boolean> {
    status.value = 'loading'
    const result = await gesture
    return result.ok ? succeed(result.value) : fail(result.error)
  }

  const rename = (id: RecipeId, name: string) =>
    change(useContainer().inventory.renameRecipe.execute(id, name))

  const changeLine = (id: RecipeId, lineIndex: number, grams: number) =>
    change(useContainer().inventory.changeRecipeLine.execute(id, lineIndex, grams))

  const removeLine = (id: RecipeId, lineIndex: number) =>
    change(useContainer().inventory.removeRecipeLine.execute(id, lineIndex))

  return { recipes, current, status, error, load, open, saveMeal, rename, changeLine, removeLine, remove }
})
