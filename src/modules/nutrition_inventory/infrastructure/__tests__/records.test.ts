import { describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { Quantity } from '@/core/nutrition/Quantity'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import { GRAM } from '@/modules/nutrition_inventory/domain/Measure'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'
import {
  type FoodRecord,
  foodToRecord,
  mealToRecord,
  recordToFood,
  recordToMeal,
} from '@/modules/nutrition_inventory/infrastructure/records'

const playerId: PlayerId = idFrom('player-1')

const juice = FoodItem.reconstitute({
  id: idFrom('user:juice'),
  name: 'Jus maison',
  macrosPer100g: Macros.reconstitute({ proteinG: 0.5, carbsG: 10, fatG: 0 }),
  source: FoodSource.USER,
  unit: 'ml',
  density: 1,
  servings: [{ label: 'verre', grams: 200, approximate: false }],
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const mealWith = (entry: MealEntry): Meal =>
  unwrap(
    Meal.create({
      playerId,
      type: MealType.BREAKFAST,
      loggedAt: new Date('2026-09-27T08:00:00Z'),
      entries: [entry],
    }),
  )

describe('records — portions', () => {
  it('conserve unité, densité et portions d’une fiche', () => {
    const restored = recordToFood(foodToRecord(juice))

    expect(restored.unit).toBe('ml')
    expect(restored.measures).toEqual(juice.measures)
  })

  it('relit une fiche d’avant les portions comme une fiche en grammes', () => {
    const legacy: Record<string, unknown> = { ...foodToRecord(juice) }
    for (const key of ['unit', 'density', 'servings']) delete legacy[key]
    const restored = recordToFood(legacy as unknown as FoodRecord)

    expect(restored.unit).toBe('g')
    expect(restored.measures).toEqual([GRAM])
  })

  it('garde la mesure d’une ligne, et tait le gramme', () => {
    const glass = juice.measureNamed('verre')
    const inGlasses = unwrap(MealEntry.fromFoodItem(juice, Quantity.reconstitute(300), undefined, glass))
    const inGrams = unwrap(MealEntry.fromFoodItem(juice, Quantity.reconstitute(300), undefined, GRAM))

    const record = mealToRecord(mealWith(inGlasses))
    expect(record.entries[0]?.measure).toEqual({ ...glass })
    expect(recordToMeal(record).entries[0]?.amount).toBe(1.5)

    // Un repas saisi en grammes s'écrit exactement comme avant les portions.
    expect(mealToRecord(mealWith(inGrams)).entries[0]).not.toHaveProperty('measure')
    expect(recordToMeal(mealToRecord(mealWith(inGrams))).entries[0]?.measure).toEqual(GRAM)
  })
})
