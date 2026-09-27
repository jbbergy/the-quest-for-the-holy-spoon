import type { AppContainer } from '@/app/composition'
import { addDays, type DayKey } from '@/core/day'
import type { BaseError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { ok, type Result } from '@/core/result'
import type { HouseholdView } from '@/modules/household/application'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import type { GroceryDemand, GroceryLine } from '@/modules/shopping/application'

/** Pourquoi les repas d'un membre ne sont pas dans la liste. */
export type SkipReason = 'not-shared' | 'unreachable'

export interface SkippedMember {
  readonly name: string
  readonly reason: SkipReason
}

export interface DemandReport {
  readonly demand: GroceryDemand
  /** Membres dont les repas n'ont pas pu être lus : leurs parts restent telles quelles. */
  readonly skipped: readonly SkippedMember[]
}

/**
 * Aliments des repas **pas encore mangés** : ce qui a été mangé n'est plus à
 * acheter.
 */
export function groceryLinesOf(meals: readonly MealSummary[]): GroceryLine[] {
  return meals
    .filter((meal) => meal.consumedAt === null)
    .flatMap((meal) =>
      meal.entries.map((entry) => ({
        foodItemId: entry.foodItemId,
        name: entry.foodName,
        grams: entry.grams,
        unit: entry.measure,
      })),
    )
}

/**
 * Ce que les repas de la semaine demandent, pour soi et pour les membres du
 * foyer.
 *
 * Ses propres repas se lisent sur l'appareil, toujours à jour, même hors
 * ligne. Ceux des autres membres se lisent en ligne, et seulement s'ils
 * partagent leurs journées — c'est leur réglage. Un membre qu'on ne peut pas
 * lire n'est pas compté : sa part dans la liste ne change pas, et il pourra
 * la remplir lui-même.
 *
 * Trois contextes se croisent ici — les repas, le foyer, la liste —, d'où la
 * place de cette fonction dans `src/app/`.
 */
export async function readGroceryDemand(
  container: AppContainer,
  self: PlayerId,
  week: DayKey,
  household: HouseholdView | null,
): Promise<Result<DemandReport, BaseError>> {
  const own = await container.inventory.week.execute(self, week)
  if (!own.ok) return own

  const demand = new Map<PlayerId, GroceryLine[]>([
    [self, groceryLinesOf(own.value.days.flatMap((day) => day.meals))],
  ])
  const skipped: SkippedMember[] = []

  const others = (household?.members ?? []).flatMap((member) =>
    member.playerId === null || member.playerId === self
      ? []
      : [{ ...member, playerId: member.playerId, label: member.name ?? member.email }],
  )

  await Promise.all(
    others.map(async (member) => {
      if (!member.sharesDays) {
        skipped.push({ name: member.label, reason: 'not-shared' })
        return
      }
      const meals = await container.memberDays.meals(member.playerId, week, addDays(week, 6))
      if (meals.ok) {
        demand.set(member.playerId, groceryLinesOf(meals.value))
      } else {
        skipped.push({
          name: member.label,
          reason: meals.error.code === 'DAYS_NOT_SHARED' ? 'not-shared' : 'unreachable',
        })
      }
    }),
  )

  return ok({ demand, skipped: skipped.sort((a, b) => a.name.localeCompare(b.name, 'fr')) })
}
