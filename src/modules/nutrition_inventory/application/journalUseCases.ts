/**
 * Use Cases de lecture : la journée, l'historique des jours mangés, la semaine
 * et l'export des données.
 */
import { ApplicationError } from '@/core/errors'
import { type DayKey, dayKeyOf, weekOf } from '@/core/day'
import type { PlayerId } from '@/core/identity'
import { Macros, type MacrosProps } from '@/core/nutrition/Macros'
import { NutrientDetail, type NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { FoodSource } from '../domain/FoodItem'
import type { IFoodRepository, IMealRepository } from '../domain/repositories'

import {
  type FoodExport,
  type MealExport,
  type MealSummary,
  toFoodExport,
  toMealExport,
  toMealSummary,
} from './readModels'
import { type InventoryError } from './shared'

// --- Journal -----------------------------------------------------------------

export interface DailyJournal {
  readonly day: string
  /** Tous les repas du jour, pris ou simplement prévus. */
  readonly meals: readonly MealSummary[]
  /** Ceux qui ont effectivement été mangés — les seuls qui alimentent les jauges. */
  readonly consumedMeals: readonly MealSummary[]
  /** Calories réellement consommées, donc sur `consumedMeals` seulement. */
  readonly totalCalories: number
  /** Macronutriments réellement consommés, agrégés une fois pour toutes. */
  readonly totalMacros: MacrosProps
  /** Fibres, sucres, AG saturés et sel réellement consommés. */
  readonly totalDetail: NutrientDetailProps
}

/**
 * Journal d'une journée.
 *
 * Retourne des **read models** et non des entités : c'est ce que `planning` et
 * la couche présentation consomment, et cela garantit qu'aucun appelant ne peut
 * contourner les Use Cases pour modifier un repas.
 */
export class GetDailyJournalUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(playerId: PlayerId, day: Date): Promise<Result<DailyJournal, InventoryError>> {
    const found = await this.meals.findByPlayerAndDay(playerId, day)
    if (!found.ok) {
      return err(
        new ApplicationError('JOURNAL_UNREADABLE', 'Le journal n’a pas pu être lu.', {
          cause: found.error,
        }),
      )
    }

    // Le tri « pris / prévu » est fait **ici**, une fois. Le laisser à chaque
    // écran garantirait qu'un écran l'oublie et affiche des apports fictifs.
    const summaries = found.value.map(toMealSummary)
    const consumedMeals = summaries.filter((meal) => meal.consumedAt !== null)

    const totals = totalsOf(consumedMeals)

    return ok({
      day: dayKeyOf(day),
      meals: summaries,
      consumedMeals,
      totalCalories: totals.calories,
      totalMacros: totals.macros,
      totalDetail: totals.detail,
    })
  }
}

interface ConsumedTotals {
  readonly calories: number
  readonly macros: MacrosProps
  readonly detail: NutrientDetailProps
}

/**
 * Somme des repas pris.
 *
 * Agrégée **ici**, et non dans chaque écran : le journal du jour et
 * l'historique doivent compter exactement de la même façon, sans quoi la
 * moyenne de la semaine ne correspondrait pas aux jauges des jours passés.
 */
function totalsOf(consumedMeals: readonly MealSummary[]): ConsumedTotals {
  const macros = consumedMeals.reduce(
    (sum, meal) => sum.plus(Macros.reconstitute(meal.macros)),
    Macros.zero(),
  )
  const detail = consumedMeals.reduce(
    (sum, meal) => sum.plus(NutrientDetail.reconstitute(meal.detail)),
    NutrientDetail.zero(),
  )
  return {
    calories: consumedMeals.reduce((sum, meal) => sum + meal.calories, 0),
    macros: macros.toJSON(),
    detail: detail.toJSON(),
  }
}

// --- Historique --------------------------------------------------------------

/** Ce qui a été effectivement pris un jour donné. */
export interface DailyConsumption extends ConsumedTotals {
  readonly day: DayKey
  readonly consumedMealCount: number
}

/**
 * Apports réels, jour par jour, sur une période.
 *
 * Seuls figurent les jours où **au moins un repas a été pris**. Un jour absent
 * n'est pas un jour à zéro calorie : c'est un jour dont on ne sait rien, et
 * c'est à l'appelant d'en décider — pas à ce Use Case de le travestir en jeûne.
 */
export class GetConsumptionHistoryUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(
    playerId: PlayerId,
    from: DayKey,
    to: DayKey,
  ): Promise<Result<readonly DailyConsumption[], InventoryError>> {
    const found = await this.meals.findByPlayerBetween(playerId, from, to)
    if (!found.ok) {
      return err(
        new ApplicationError('HISTORY_UNREADABLE', 'L’historique des repas n’a pas pu être lu.', {
          cause: found.error,
        }),
      )
    }

    const consumedByDay = new Map<DayKey, MealSummary[]>()
    for (const meal of found.value) {
      if (!meal.isConsumed) continue
      const sameDay = consumedByDay.get(meal.plannedFor) ?? []
      consumedByDay.set(meal.plannedFor, [...sameDay, toMealSummary(meal)])
    }

    return ok(
      [...consumedByDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, meals]) => ({ day, consumedMealCount: meals.length, ...totalsOf(meals) })),
    )
  }
}

// --- Semaine -----------------------------------------------------------------

export interface PlannedDay {
  readonly day: DayKey
  /** Repas du jour, pris ou prévus, dans l'ordre où ils ont été composés. */
  readonly meals: readonly MealSummary[]
  /**
   * Calories de **tous** les repas du jour, pris ou non.
   *
   * L'inverse du tableau de bord, et volontairement : planifier, c'est regarder
   * ce qu'une journée représentera une fois vécue. N'y compter que les repas
   * pris afficherait zéro sur tous les jours à venir.
   */
  readonly plannedCalories: number
}

export interface WeekPlan {
  /** Les sept jours, du lundi au dimanche, y compris ceux sans aucun repas. */
  readonly days: readonly PlannedDay[]
}

/**
 * Semaine de repas contenant un jour donné.
 *
 * Les jours vides figurent dans le résultat : c'est sur eux que la
 * planification se fait, et les laisser à la présentation obligerait chaque
 * écran à recalculer le calendrier.
 */
export class GetWeekPlanUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(playerId: PlayerId, anyDay: DayKey): Promise<Result<WeekPlan, InventoryError>> {
    const days = weekOf(anyDay)
    const first = days[0]
    const last = days[days.length - 1]
    if (first === undefined || last === undefined) return ok({ days: [] })

    const found = await this.meals.findByPlayerBetween(playerId, first, last)
    if (!found.ok) {
      return err(
        new ApplicationError('WEEK_UNREADABLE', 'La semaine n’a pas pu être lue.', {
          cause: found.error,
        }),
      )
    }

    return ok({
      days: days.map((day) => {
        const meals = found.value.filter((meal) => meal.plannedFor === day).map(toMealSummary)
        return {
          day,
          meals,
          plannedCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
        }
      }),
    })
  }
}

// --- Export ------------------------------------------------------------------

export interface InventoryExport {
  /** Tout l'historique du joueur, du plus ancien au plus récent. */
  readonly meals: readonly MealExport[]
  /** Les fiches créées par l'utilisateur, seule partie du catalogue qui lui appartienne. */
  readonly customFoods: readonly FoodExport[]
}

/**
 * Données de `nutrition_inventory` destinées à l'export.
 *
 * Le catalogue Ciqual en est volontairement absent : il est public, versionné
 * dans le dépôt, et un export de 600 Ko de données que l'application sait
 * régénérer seule noierait les quelques kilo-octets qui, eux, n'existent nulle
 * part ailleurs.
 */
export class ExportInventoryUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly foods: IFoodRepository,
  ) {}

  async execute(playerId: PlayerId): Promise<Result<InventoryExport, InventoryError>> {
    const meals = await this.meals.findAllByPlayer(playerId)
    if (!meals.ok) {
      return err(
        new ApplicationError('HISTORY_UNREADABLE', 'L’historique n’a pas pu être lu.', {
          cause: meals.error,
        }),
      )
    }

    const customFoods = await this.foods.findBySource(FoodSource.USER)
    if (!customFoods.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: customFoods.error,
        }),
      )
    }

    return ok({
      meals: meals.value.map(toMealExport),
      // Les siens seulement : ceux des autres membres du foyer, reçus par
      // synchronisation, appartiennent à leur auteur et à son propre export.
      customFoods: customFoods.value
        .filter((item) => item.ownerId === null || item.ownerId === playerId)
        .map(toFoodExport),
    })
  }
}
