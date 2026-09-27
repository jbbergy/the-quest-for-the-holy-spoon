import type { DayKey } from '@/core/day'
import { idFrom, type PlayerId } from '@/core/identity'

import type { ShoppingListRef, ShoppingUnit } from '../ShoppingItem'
import type { GroceryLine } from '../ShoppingListFiller'

export const WEEK = '2026-09-28' as DayKey
export const CAMILLE = idFrom<'PlayerId'>('player-camille')
export const ALEX = idFrom<'PlayerId'>('player-alex')
export const SACHA = idFrom<'PlayerId'>('player-sacha')

export const HOUSEHOLD_LIST: ShoppingListRef = {
  householdId: idFrom<'HouseholdId'>('foyer-1'),
  playerId: CAMILLE,
  week: WEEK,
}

export const PERSONAL_LIST: ShoppingListRef = { householdId: null, playerId: CAMILLE, week: WEEK }

export const EGG: ShoppingUnit = { label: 'œuf', grams: 60, countable: true, approximate: true }
export const GRAM: ShoppingUnit = { label: 'g', grams: 1, countable: false, approximate: false }

export const line = (
  foodItemId: string,
  grams: number,
  unit: ShoppingUnit = GRAM,
  name = foodItemId,
): GroceryLine => ({ foodItemId: idFrom<'FoodItemId'>(foodItemId), name, grams, unit })

export const demandOf = (
  entries: readonly (readonly [PlayerId, readonly GroceryLine[]])[],
): ReadonlyMap<PlayerId, readonly GroceryLine[]> => new Map(entries)
