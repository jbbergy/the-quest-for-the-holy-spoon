/**
 * Read models exposés par `nutrition_inventory`.
 *
 * Ils vivent dans un fichier distinct de `index.ts` pour que les Use Cases
 * puissent les importer sans créer de cycle avec la façade qui, elle, réexporte
 * les Use Cases.
 */
import type { DayKey } from '@/core/day'
import type { FavoritePortionId, FoodItemId, MealEntryId, MealId, PlayerId, RecipeId } from '@/core/identity'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'

import type { FavoritePortion } from '../domain/FavoritePortion'
import type { FoodItem, FoodTag } from '../domain/FoodItem'
import type { Meal, MealType } from '../domain/Meal'
import { lineAmount, type Recipe } from '../domain/Recipe'
import type { BaseUnit, Measure, Serving } from '../domain/Measure'

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
  /** Mesure de saisie, et la quantité qu'elle exprime : 2 « tranche ». */
  readonly measure: Measure
  readonly amount: number
  readonly calories: number
  /** Macronutriments de la ligne, pour les totaux d'un repas en cours de composition. */
  readonly macros: MacrosProps
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
  /** Membre du foyer qui a prévu ce repas pour vous, ou `null`. */
  readonly plannedBy: PlayerId | null
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
    plannedBy: meal.plannedBy,
    entryCount: meal.entryCount,
    macros: totals.macros.toJSON(),
    detail: totals.detail.toJSON(),
    calories: totals.calories,
    entries: meal.entries.map((entry) => ({
      entryId: entry.id,
      foodItemId: entry.foodItemId,
      foodName: entry.foodName,
      grams: entry.quantity.grams,
      measure: entry.measure,
      amount: entry.amount,
      calories: entry.calories(),
      macros: entry.macros.toJSON(),
    })),
  }
}

/** Un ingrédient de recette, tel qu'on l'affiche : « Riz — 150 g ». */
export interface RecipeLineSummary {
  readonly foodItemId: FoodItemId
  readonly foodName: string
  readonly grams: number
  readonly measure: Measure
  readonly amount: number
}

/** Une portion favorite, telle que le choix de la quantité la propose. */
export interface FavoritePortionSummary {
  readonly id: FavoritePortionId
  readonly foodItemId: FoodItemId
  readonly grams: number
  /** Nom de la mesure de saisie : « g », « tranche ». */
  readonly measure: string
}

export function toFavoritePortionSummary(portion: FavoritePortion): FavoritePortionSummary {
  return {
    id: portion.id,
    foodItemId: portion.foodItemId,
    grams: portion.quantity.grams,
    measure: portion.measure,
  }
}

/** Read model d'une recette, pour la liste de l'éditeur de repas. */
export interface RecipeSummary {
  readonly recipeId: RecipeId
  readonly name: string
  readonly lines: readonly RecipeLineSummary[]
}

export function toRecipeSummary(recipe: Recipe): RecipeSummary {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    lines: recipe.lines.map((line) => ({
      foodItemId: line.foodItemId,
      foodName: line.foodName,
      grams: line.quantity.grams,
      measure: line.measure,
      amount: lineAmount(line),
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
  /** « 2 » et « tranche » : la portion telle qu'elle a été saisie. */
  readonly amount: number
  readonly unit: string
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
      amount: entry.amount,
      unit: entry.measure.label,
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
  readonly unit: BaseUnit
  readonly servings: readonly Serving[]
}

export function toFoodExport(item: FoodItem): FoodExport {
  return {
    id: item.id,
    name: item.name,
    macrosPer100g: item.macrosPer100g.toJSON(),
    detailPer100g: item.detailPer100g.toJSON(),
    barcode: item.barcode ?? null,
    tags: [...item.tags],
    unit: item.unit,
    servings: item.servings.map((serving) => ({ ...serving })),
  }
}
