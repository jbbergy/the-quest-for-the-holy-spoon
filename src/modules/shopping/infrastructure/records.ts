import type { DayKey } from '@/core/day'
import { idFrom } from '@/core/identity'

import { listKey, ShoppingItem, type ShoppingUnit } from '../domain/ShoppingItem'

/**
 * Article tel que stocké dans IndexedDB, et tel que la synchronisation le
 * transporte. `listKey` n'est là que pour l'index : IndexedDB n'indexe pas une
 * valeur `null`, et une liste est celle d'un foyer **ou** d'une personne.
 */
export interface ShoppingItemRecord {
  readonly id: string
  readonly listKey: string
  readonly householdId: string | null
  readonly playerId: string
  readonly week: string
  readonly name: string
  readonly foodItemId: string | null
  readonly unit: ShoppingUnit
  /** Grammes voulus par chaque profil. */
  readonly contributions: Readonly<Record<string, number>>
  /** Grammes ajoutés à la main ; absent des articles d'avant la recherche. */
  readonly addedGrams?: number
  /** Quantité en toutes lettres d'un article sans aliment ; absente avant son ajout. */
  readonly quantityText?: string | null
  readonly checked: boolean
}

export function shoppingItemToRecord(item: ShoppingItem): ShoppingItemRecord {
  return {
    id: item.id,
    listKey: listKey(item),
    householdId: item.householdId,
    playerId: item.playerId,
    week: item.week,
    name: item.name,
    foodItemId: item.foodItemId,
    unit: { ...item.unit },
    contributions: Object.fromEntries(item.contributions),
    addedGrams: item.addedGrams,
    quantityText: item.quantityText,
    checked: item.checked,
  }
}

export function recordToShoppingItem(record: ShoppingItemRecord): ShoppingItem {
  return ShoppingItem.reconstitute({
    id: idFrom<'ShoppingItemId'>(record.id),
    householdId: record.householdId === null ? null : idFrom<'HouseholdId'>(record.householdId),
    playerId: idFrom<'PlayerId'>(record.playerId),
    week: record.week as DayKey,
    name: record.name,
    foodItemId: record.foodItemId === null ? null : idFrom<'FoodItemId'>(record.foodItemId),
    unit: record.unit,
    contributions: new Map(
      Object.entries(record.contributions).map(([playerId, grams]) => [
        idFrom<'PlayerId'>(playerId),
        grams,
      ]),
    ),
    addedGrams: record.addedGrams ?? 0,
    quantityText: record.quantityText ?? null,
    checked: record.checked,
  })
}
