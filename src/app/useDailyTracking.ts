import { computed, type ComputedRef } from 'vue'

import { useContainer } from '@/app/container'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { useProgressStore } from '@/modules/gamification/presentation/useProgressStore'
import type { AddFoodInput } from '@/modules/nutrition_inventory/application'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import type { IdealFoodProfile } from '@/modules/planning/application'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

/**
 * Coordination des quatre contextes pour l'écran du jour.
 *
 * C'est **la seule couche autorisée à en connaître plusieurs à la fois**. Les
 * stores, eux, restent enfermés dans leur module : le journal ignore la
 * gamification, et `planning` n'a pas de store du tout puisqu'il n'a aucun état
 * propre — sa recommandation est une pure dérivation des read models des autres.
 *
 * Faire circuler cette coordination par les stores aurait recréé, au niveau de
 * la présentation, exactement l'enchevêtrement que la règle de frontière évite
 * dans le domaine.
 */
export interface DailyTracking {
  readonly suggestion: ComputedRef<IdealFoodProfile | null>
  readonly suggestionError: ComputedRef<ErrorView | null>
  loadDay(playerId: PlayerId, date?: Date): Promise<boolean>
  logFood(input: AddFoodInput): Promise<boolean>
}

export function useDailyTracking(): DailyTracking {
  const players = usePlayerStore()
  const journal = useJournalStore()
  const progress = useProgressStore()

  const outcome = computed(() => {
    const needs = players.needs
    if (needs === null) return null
    // `consumedMeals`, pas `meals` : un repas préparé à l'avance ne doit pas
    // faire croire à l'assistant qu'il ne reste plus rien à manger.
    return useContainer().planning.suggestCompletion.execute(needs, journal.consumedMeals)
  })

  const suggestion = computed<IdealFoodProfile | null>(() =>
    outcome.value?.ok === true ? outcome.value.value : null,
  )

  const suggestionError = computed<ErrorView | null>(() =>
    outcome.value?.ok === false ? toErrorView(outcome.value.error) : null,
  )

  async function loadDay(playerId: PlayerId, date: Date = new Date()): Promise<boolean> {
    const [journalLoaded, progressLoaded] = await Promise.all([
      journal.load(playerId, date),
      progress.load(playerId),
    ])
    return journalLoaded && progressLoaded
  }

  /**
   * Enregistre un aliment puis répercute le gain d'XP.
   *
   * L'ordre est sûr : `AddFoodToMealUseCase` attend la diffusion de
   * `MealLoggedEvent` avant de rendre la main, donc l'XP est déjà attribuée et
   * persistée quand la relecture démarre.
   */
  async function logFood(input: AddFoodInput): Promise<boolean> {
    const logged = await journal.addFood(input)
    if (!logged) return false

    await progress.load(input.playerId)
    return true
  }

  return { suggestion, suggestionError, loadDay, logFood }
}
