import type { FoodItemId, PlayerId } from '@/core/identity'
import { ok, type Result } from '@/core/result'

import {
  GRAM_UNIT,
  type InvalidShoppingItemError,
  mealItemId,
  sameUnit,
  ShoppingItem,
  type ShoppingListRef,
  type ShoppingUnit,
} from './ShoppingItem'

/** Un aliment d'un repas prévu : ce qu'il faudra acheter pour une personne. */
export interface GroceryLine {
  readonly foodItemId: FoodItemId
  readonly name: string
  readonly grams: number
  /** Unité dans laquelle la portion a été saisie. */
  readonly unit: ShoppingUnit
}

/**
 * Ce que les repas de la semaine demandent, personne par personne.
 *
 * Seules les personnes dont on a pu lire les repas y figurent — une liste
 * vide dit « rien à acheter », une absence dit « on ne sait pas ».
 */
export type GroceryDemand = ReadonlyMap<PlayerId, readonly GroceryLine[]>

export interface FillPlan {
  /** Articles à écrire : nouveaux, ou dont la quantité a changé. */
  readonly save: readonly ShoppingItem[]
}

interface FoodDemand {
  readonly name: string
  readonly units: ShoppingUnit[]
  readonly contributions: Map<PlayerId, number>
}

/**
 * Remplit la liste à partir des repas prévus.
 *
 * Les aliments sont regroupés par fiche : le riz du déjeuner et celui du dîner,
 * le mien et celui des autres, font une seule ligne. L'unité suit les
 * portions saisies (« 6 œufs ») quand elles parlent toutes de la même ; sinon,
 * on compte en grammes.
 *
 * Ce qui ne change pas :
 * - les articles écrits à la main ;
 * - les parts des personnes absentes de `demand`.
 *
 * Remplir n'enlève **jamais** d'article : seule la personne le retire, d'un
 * geste explicite. Un article dont plus aucun repas n'a besoin reste, sans
 * quantité — l'écran le signale.
 */
export function fillShoppingList(
  list: ShoppingListRef,
  existing: readonly ShoppingItem[],
  demand: GroceryDemand,
): Result<FillPlan, InvalidShoppingItemError> {
  const counted = new Set(demand.keys())
  const foods = groupByFood(demand)
  const save: ShoppingItem[] = []
  const known = new Map(existing.map((item) => [item.id, item]))

  for (const [foodItemId, food] of foods) {
    const unit = commonUnit(food.units)
    const id = mealItemId(list, foodItemId)
    let current = known.get(id)
    if (current === undefined) {
      const created = ShoppingItem.fromMeals(list, { foodItemId, name: food.name, unit })
      if (!created.ok) return created
      current = created.value
    }
    const updated = current.withContributions(counted, food.contributions, mergeUnit(current, counted, unit))
    if (!known.has(id) || !updated.sameAs(current)) save.push(updated)
  }

  // Articles tirés des repas dont les personnes comptées n'ont plus besoin :
  // leur part s'efface, l'article reste.
  for (const item of existing) {
    if (item.isManual || item.foodItemId === null || foods.has(item.foodItemId)) continue
    const updated = item.withContributions(counted, new Map(), item.unit)
    if (!updated.sameAs(item)) save.push(updated)
  }

  return ok({ save })
}

function groupByFood(demand: GroceryDemand): Map<FoodItemId, FoodDemand> {
  const foods = new Map<FoodItemId, FoodDemand>()
  for (const [playerId, lines] of demand) {
    for (const line of lines) {
      if (!(line.grams > 0)) continue
      let food = foods.get(line.foodItemId)
      if (food === undefined) {
        food = { name: line.name, units: [], contributions: new Map() }
        foods.set(line.foodItemId, food)
      }
      food.units.push(line.unit)
      food.contributions.set(playerId, (food.contributions.get(playerId) ?? 0) + line.grams)
    }
  }
  return foods
}

/** L'unité commune à toutes les portions, ou le gramme dès qu'elles diffèrent. */
function commonUnit(units: readonly ShoppingUnit[]): ShoppingUnit {
  const [first, ...others] = units
  if (first === undefined) return GRAM_UNIT
  return others.every((unit) => sameUnit(unit, first)) ? first : GRAM_UNIT
}

/**
 * Unité de l'article après remplissage. Si d'autres personnes y ont une part,
 * ou si l'on en a ajouté à la main, saisie peut-être dans une autre unité, on ne garde la nouvelle unité que si
 * c'est la même ; sinon, le gramme, qui convient à tout le monde.
 */
function mergeUnit(
  item: ShoppingItem,
  counted: ReadonlySet<PlayerId>,
  unit: ShoppingUnit,
): ShoppingUnit {
  const othersRemain =
    item.addedGrams > 0 || [...item.contributions.keys()].some((playerId) => !counted.has(playerId))
  return !othersRemain || sameUnit(item.unit, unit) ? unit : GRAM_UNIT
}
