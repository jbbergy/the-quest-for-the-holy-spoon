import { describe, expect, it } from 'vitest'

import { Diet, DietSuitability } from '@/modules/nutrition_inventory/domain/DietSuitability'
import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'

const food = (...tags: FoodTag[]) => ({ tags })

describe('DietSuitability', () => {
  it('laisse passer un aliment sans marqueur, quel que soit le régime', () => {
    expect(DietSuitability.suits(food(), Object.values(Diet))).toBe(true)
  })

  it('écarte la viande et le poisson d’un régime végétarien', () => {
    expect(DietSuitability.conflicts(food(FoodTag.CONTAINS_MEAT), [Diet.VEGETARIAN])).toEqual([
      Diet.VEGETARIAN,
    ])
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_FISH), [Diet.VEGETARIAN])).toBe(false)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_MILK), [Diet.VEGETARIAN])).toBe(true)
  })

  it('garde le poisson pour un régime pescétarien', () => {
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_FISH), [Diet.PESCATARIAN])).toBe(true)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_MEAT), [Diet.PESCATARIAN])).toBe(false)
  })

  it('écarte aussi le lait et les œufs d’un régime végan', () => {
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_MILK), [Diet.VEGAN])).toBe(false)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_EGG), [Diet.VEGAN])).toBe(false)
  })

  it('écarte porc, bœuf, fruits de mer et alcool des régimes qui les évitent', () => {
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_PORK), [Diet.PORK_FREE])).toBe(false)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_BEEF), [Diet.PORK_FREE])).toBe(true)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_BEEF), [Diet.BEEF_FREE])).toBe(false)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_SHELLFISH), [Diet.SHELLFISH_FREE])).toBe(
      false,
    )
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_FISH), [Diet.SHELLFISH_FREE])).toBe(true)
    expect(DietSuitability.conflicts(food(FoodTag.CONTAINS_ALCOHOL), Object.values(Diet))).toEqual(
      [Diet.ALCOHOL_FREE],
    )
  })

  it('traite porc, bœuf et fruits de mer comme de la chair animale', () => {
    for (const tag of [FoodTag.CONTAINS_PORK, FoodTag.CONTAINS_BEEF, FoodTag.CONTAINS_SHELLFISH]) {
      expect(DietSuitability.suits(food(tag), [Diet.VEGETARIAN])).toBe(false)
      expect(DietSuitability.suits(food(tag), [Diet.VEGAN])).toBe(false)
    }
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_PORK), [Diet.PESCATARIAN])).toBe(false)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_SHELLFISH), [Diet.PESCATARIAN])).toBe(true)
  })

  it('admet un aliment expressément marqué compatible', () => {
    const glutenFreeBread = food(FoodTag.CONTAINS_GLUTEN, FoodTag.GLUTEN_FREE)
    expect(DietSuitability.suits(glutenFreeBread, [Diet.GLUTEN_FREE])).toBe(true)
    expect(
      DietSuitability.suits(food(FoodTag.CONTAINS_MILK, FoodTag.LACTOSE_FREE), [Diet.LACTOSE_FREE]),
    ).toBe(true)
    expect(DietSuitability.suits(food(FoodTag.CONTAINS_MILK, FoodTag.VEGAN), [Diet.VEGAN])).toBe(
      true,
    )
  })

  it('nomme chaque régime en conflit', () => {
    const sandwich = food(FoodTag.CONTAINS_GLUTEN, FoodTag.CONTAINS_MEAT)
    expect(
      DietSuitability.conflicts(sandwich, [Diet.GLUTEN_FREE, Diet.VEGETARIAN, Diet.LACTOSE_FREE]),
    ).toEqual([Diet.GLUTEN_FREE, Diet.VEGETARIAN])
  })
})
