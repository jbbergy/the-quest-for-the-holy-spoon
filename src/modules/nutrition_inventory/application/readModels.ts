/**
 * Read models exposés par `nutrition_inventory`.
 *
 * Ils vivent dans un fichier distinct de `index.ts` pour que les Use Cases
 * puissent les importer sans créer de cycle avec la façade qui, elle, réexporte
 * les Use Cases.
 */
import type { DayKey } from '@/core/day'
import type { FoodItemId, MealEntryId, MealId, PlayerId } from '@/core/identity'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'

import type { FoodItem, FoodTag } from '../domain/FoodItem'
import type { Meal, MealType } from '../domain/Meal'

/**
 * Une ligne de repas, telle que l'éditeur de repas l'affiche et la modifie.
 *
 * `entryId` en fait partie parce que c'est lui qu'attendent
 * `RemoveMealEntryUseCase` et `ChangeMealEntryQuantityUseCase` : sans lui, la
 * présentation pourrait montrer les lignes d'un repas mais pas les corriger.
 */
export interface MealEntrySummary {
  readonly entryId: MealEntryId
  /** Permet de re-proposer l'aliment ; jamais de recalculer la ligne. */
  readonly foodItemId: FoodItemId
  readonly foodName: string
  readonly grams: number
  readonly calories: number
}

/** Read model consommé par `planning` et par la présentation. */
export interface MealSummary {
  readonly mealId: MealId
  readonly playerId: PlayerId
  readonly type: MealType
  readonly loggedAt: string
  /** Jour auquel le repas appartient. */
  readonly plannedFor: DayKey
  /** `null` tant que le repas n'est que prévu : il ne compte pas dans les totaux. */
  readonly consumedAt: string | null
  readonly entryCount: number
  readonly macros: MacrosProps
  /** Fibres, sucres, AG saturés et sel du repas, en grammes. */
  readonly detail: NutrientDetailProps
  readonly calories: number
  /**
   * Le détail des lignes, et non la seule liste des noms.
   *
   * C'était `foodNames` tant qu'on se contentait d'afficher ; corriger
   * une portion demande l'identifiant et la quantité de chaque ligne, et tenir
   * les deux formes côte à côte aurait dupliqué la même information.
   */
  readonly entries: readonly MealEntrySummary[]
}

export function toMealSummary(meal: Meal): MealSummary {
  const totals = meal.calculateTotals()
  return {
    mealId: meal.id,
    playerId: meal.playerId,
    type: meal.type,
    loggedAt: meal.loggedAt.toISOString(),
    plannedFor: meal.plannedFor,
    consumedAt: meal.consumedAt === null ? null : meal.consumedAt.toISOString(),
    entryCount: meal.entryCount,
    macros: totals.macros.toJSON(),
    detail: totals.detail.toJSON(),
    calories: totals.calories,
    entries: meal.entries.map((entry) => ({
      entryId: entry.id,
      foodItemId: entry.foodItemId,
      foodName: entry.foodName,
      grams: entry.quantity.grams,
      calories: entry.calories(),
    })),
  }
}

/**
 * Vues d'export.
 *
 * Elles sont distinctes de `MealSummary`, et volontairement : un résumé sert à
 * afficher une ligne de journal et n'a donc besoin que de totaux, tandis qu'un
 * export doit rester **relisible sans l'application** — donc porter le détail
 * des portions. Les faire coïncider alourdirait chaque lecture du journal pour
 * le bénéfice d'une action déclenchée deux fois par an.
 */
export interface MealEntryExport {
  readonly foodName: string
  readonly grams: number
  readonly macros: MacrosProps
  readonly detail: NutrientDetailProps
}

export interface MealExport {
  readonly id: MealId
  readonly type: MealType
  readonly loggedAt: string
  /** Jour auquel le repas appartient — distinct de `loggedAt` depuis la planification. */
  readonly plannedFor: string
  /** `null` pour un repas composé mais jamais pris : la distinction survit à l'export. */
  readonly consumedAt: string | null
  readonly calories: number
  readonly detail: NutrientDetailProps
  readonly entries: readonly MealEntryExport[]
}

export function toMealExport(meal: Meal): MealExport {
  const totals = meal.calculateTotals()
  return {
    id: meal.id,
    type: meal.type,
    loggedAt: meal.loggedAt.toISOString(),
    plannedFor: meal.plannedFor,
    consumedAt: meal.consumedAt === null ? null : meal.consumedAt.toISOString(),
    calories: totals.calories,
    detail: totals.detail.toJSON(),
    entries: meal.entries.map((entry) => ({
      foodName: entry.foodName,
      grams: entry.quantity.grams,
      macros: entry.macros.toJSON(),
      detail: entry.detail.toJSON(),
    })),
  }
}

export interface FoodExport {
  readonly id: FoodItemId
  readonly name: string
  readonly macrosPer100g: MacrosProps
  readonly detailPer100g: NutrientDetailProps
  /** `null` plutôt qu'absent : un JSON d'archive se relit mieux quand ses clés sont stables. */
  readonly barcode: string | null
  readonly tags: readonly FoodTag[]
}

export function toFoodExport(item: FoodItem): FoodExport {
  return {
    id: item.id,
    name: item.name,
    macrosPer100g: item.macrosPer100g.toJSON(),
    detailPer100g: item.detailPer100g.toJSON(),
    barcode: item.barcode ?? null,
    tags: [...item.tags],
  }
}
