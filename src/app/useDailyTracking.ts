import { computed, type ComputedRef } from 'vue'

import { useContainer } from '@/app/container'
import { dayKeyOf } from '@/core/day'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import {
  type IdealFoodProfile,
  type RecentIntake,
  recentWindow,
} from '@/modules/planning/application'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

/**
 * Coordination des quatre contextes pour l'écran du jour.
 *
 * C'est **la seule couche autorisée à en connaître plusieurs à la fois**. Les
 * stores, eux, restent enfermés dans leur module : le journal ignore le profil,
 * et `planning` n'a pas de store du tout puisqu'il n'a aucun état
 * propre — sa recommandation est une pure dérivation des read models des autres.
 *
 * Faire circuler cette coordination par les stores aurait recréé, au niveau de
 * la présentation, exactement l'enchevêtrement que la règle de frontière évite
 * dans le domaine.
 */
export interface DailyTracking {
  /**
   * Moyennes des sept jours précédents ; `null` tant que le profil ou
   * l'historique manque. Elles ne modifient aucun objectif du jour.
   */
  readonly recent: ComputedRef<RecentIntake | null>
  readonly suggestion: ComputedRef<IdealFoodProfile | null>
  readonly suggestionError: ComputedRef<ErrorView | null>
  loadDay(playerId: PlayerId, date?: Date): Promise<boolean>
}

export function useDailyTracking(): DailyTracking {
  const players = usePlayerStore()
  const journal = useJournalStore()
  const history = useConsumptionHistoryStore()

  const recent = computed<RecentIntake | null>(() => {
    const needs = players.needs
    if (needs === null || history.status !== 'ready') return null
    const result = useContainer().planning.recentIntake.execute(
      needs,
      history.days,
      dayKeyOf(journal.day),
    )
    return result.ok ? result.value : null
  })

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

  /**
   * La journée, et la semaine qui la précède. Les deux lectures sont
   * indépendantes : l'une qui échoue n'empêche pas l'autre d'aboutir.
   */
  async function loadDay(playerId: PlayerId, date: Date = new Date()): Promise<boolean> {
    const { from, to } = recentWindow(dayKeyOf(date))
    const [day, past] = await Promise.all([
      journal.load(playerId, date),
      history.load(playerId, from, to),
    ])
    return day && past
  }

  return { recent, suggestion, suggestionError, loadDay }
}
