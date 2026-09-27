import { type ApiError, ApiClient } from '@/contract/apiClient'
import { HOUSEHOLD_ROUTE, type MemberDaysPayload, memberDaysResponseSchema } from '@/contract/household'
import { sharedNeedsSchema } from '@/contract/sync'
import { type DayKey, dateOfDay } from '@/core/day'
import type { BaseError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { ok, type Result } from '@/core/result'
import {
  type DailyJournal,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
} from '@/modules/nutrition_inventory/application'
import type { Meal } from '@/modules/nutrition_inventory/domain/Meal'
import { InMemoryMealRepository } from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'
import { type MealRecord, recordToMeal } from '@/modules/nutrition_inventory/infrastructure/records'
import {
  type RecentIntake,
  recentWindow,
  SummarizeRecentIntakeUseCase,
} from '@/modules/planning/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

/** La journée d'un membre du foyer, telle que l'écran de consultation l'affiche. */
export interface MemberDay {
  readonly day: DayKey
  /** Nom publié par le membre, ou `null`. */
  readonly name: string | null
  /** Ses besoins publiés ; sans eux, pas de jauges, seulement les repas. */
  readonly needs: PlayerNutritionalNeeds | null
  readonly journal: DailyJournal
  readonly recent: RecentIntake | null
}

/**
 * Journées d'un autre membre du foyer, en lecture seule.
 *
 * Rien n'est écrit sur l'appareil : les repas reçus alimentent un dépôt en
 * mémoire, jeté après usage, sur lequel tournent **les mêmes** use cases que
 * pour ses propres journées. Les jauges et les moyennes d'un membre se
 * calculent donc exactement comme les siennes — aucun second calcul à tenir
 * cohérent avec le premier.
 */
export class MemberDaysReader {
  constructor(private readonly api: ApiClient = new ApiClient()) {}

  async read(playerId: PlayerId, day: DayKey): Promise<Result<MemberDay, BaseError>> {
    // Le jour lui-même, et la semaine qui le précède pour les moyennes.
    const window = recentWindow(day)
    const response = await this.fetch(playerId, window.from, day)
    if (!response.ok) return response

    const meals = new InMemoryMealRepository()
    for (const meal of mealsOf(response.value.meals)) await meals.save(meal)

    const [journal, history] = await Promise.all([
      new GetDailyJournalUseCase(meals).execute(playerId, dateOfDay(day)),
      new GetConsumptionHistoryUseCase(meals).execute(playerId, window.from, window.to),
    ])
    if (!journal.ok) return journal
    if (!history.ok) return history

    const published = needsOf(response.value.needs)
    const recent =
      published === null
        ? null
        : new SummarizeRecentIntakeUseCase().execute(published.needs, history.value, day)

    return ok({
      day,
      name: published?.name ?? null,
      needs: published?.needs ?? null,
      journal: journal.value,
      recent: recent?.ok === true ? recent.value : null,
    })
  }

  private fetch(
    playerId: PlayerId,
    from: DayKey,
    to: DayKey,
  ): Promise<Result<MemberDaysPayload, ApiError>> {
    const query = new URLSearchParams({ from, to })
    return this.api.request(
      'GET',
      `${HOUSEHOLD_ROUTE.memberDays(playerId)}?${query.toString()}`,
      memberDaysResponseSchema,
    )
  }
}

/**
 * Repas relus avec les mappers de l'appareil. Un enregistrement illisible —
 * écrit par une version plus ancienne, ou abîmé — est écarté plutôt que de
 * rendre toute la journée illisible.
 */
function mealsOf(records: readonly Record<string, unknown>[]): Meal[] {
  return records.flatMap((record) => {
    try {
      return [recordToMeal(record as unknown as MealRecord)]
    } catch {
      return []
    }
  })
}

function needsOf(
  payload: Record<string, unknown> | null,
): { readonly name: string; readonly needs: PlayerNutritionalNeeds } | null {
  const parsed = sharedNeedsSchema.safeParse(payload)
  if (!parsed.success) return null
  const shared = parsed.data
  return {
    name: shared.name,
    needs: {
      playerId: idFrom<'PlayerId'>(shared.playerId),
      targetCalories: shared.targetCalories,
      targetMacros: shared.targetMacros,
      referenceNutrients: shared.referenceNutrients,
      history: (shared.history ?? []).map((snapshot) => ({
        ...snapshot,
        until: snapshot.until as DayKey,
      })),
      // Les préférences alimentaires ne sont pas publiées : elles ne servent
      // qu'à filtrer les suggestions de leur titulaire.
      restrictions: [],
      allergens: [],
    },
  }
}
