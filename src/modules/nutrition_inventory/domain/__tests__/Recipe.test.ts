import { describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { Quantity } from '@/core/nutrition/Quantity'

import { FoodItem, FoodSource } from '../FoodItem'
import { Meal, MealType } from '../Meal'
import { MealEntry } from '../MealEntry'
import { GRAM } from '../Measure'
import { lineAmount, MAX_RECIPE_LINES, Recipe } from '../Recipe'

const playerId: PlayerId = idFrom('player-1')

const rice = FoodItem.reconstitute({
  id: idFrom('ciqual:39212'),
  name: 'Riz cuit',
  macrosPer100g: Macros.reconstitute({ proteinG: 2.5, carbsG: 28, fatG: 0.3 }),
  source: FoodSource.CIQUAL,
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const line = (grams: number) => ({
  foodItemId: rice.id,
  foodName: rice.name,
  quantity: Quantity.reconstitute(grams),
  measure: GRAM,
})

describe('Recipe', () => {
  it('garde son nom nettoyé et ses ingrédients', () => {
    const recipe = unwrap(Recipe.create({ playerId, name: '  Poke   bowl ', lines: [line(150)] }))

    expect(recipe.name).toBe('Poke bowl')
    expect(recipe.lines).toHaveLength(1)
    expect(recipe.playerId).toBe(playerId)
  })

  it.each([
    ['sans nom', '   ', [line(100)]],
    ['au nom trop long', 'x'.repeat(61), [line(100)]],
    ['sans ingrédient', 'Poke bowl', []],
    [
      'à trop d’ingrédients',
      'Poke bowl',
      Array.from({ length: MAX_RECIPE_LINES + 1 }, () => line(10)),
    ],
  ])('refuse une recette %s', (_label, name, lines) => {
    const result = Recipe.create({ playerId, name, lines })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_RECIPE')
  })

  it('se fabrique à partir des lignes d’un repas, dans leur mesure de saisie', () => {
    const serving = { label: 'bol', grams: 200, countable: true, approximate: false }
    const entry = unwrap(MealEntry.fromFoodItem(rice, Quantity.reconstitute(400), undefined, serving))
    const meal = unwrap(Meal.create({ playerId, type: MealType.LUNCH, entries: [entry] }))

    const recipe = unwrap(Recipe.fromMeal(meal, 'Riz du midi'))

    expect(recipe.lines).toEqual([
      {
        foodItemId: rice.id,
        foodName: 'Riz cuit',
        quantity: Quantity.reconstitute(400),
        measure: serving,
      },
    ])
    expect(lineAmount(recipe.lines[0]!)).toBe(2)
  })

  it('refuse de garder un repas vide', () => {
    const meal = unwrap(Meal.create({ playerId, type: MealType.LUNCH }))

    expect(Recipe.fromMeal(meal, 'Rien').ok).toBe(false)
  })

  describe('modification', () => {
    const recipe = unwrap(
      Recipe.create({ playerId, name: 'Poke bowl', lines: [line(150), line(80)] }),
    )

    it('se renomme, avec les mêmes règles qu’à la création', () => {
      expect(unwrap(recipe.rename('  Bowl  du soir ')).name).toBe('Bowl du soir')
      expect(recipe.rename('   ').ok).toBe(false)
      expect(recipe.rename('x'.repeat(61)).ok).toBe(false)
    })

    it('change la quantité d’un seul ingrédient, sans toucher à la recette d’origine', () => {
      const changed = unwrap(recipe.withLineQuantity(1, Quantity.reconstitute(200)))

      expect(changed.lines.map((l) => l.quantity.grams)).toEqual([150, 200])
      expect(recipe.lines.map((l) => l.quantity.grams)).toEqual([150, 80])
      expect(changed.id).toBe(recipe.id)
    })

    it('retire un ingrédient, mais jamais le dernier', () => {
      const one = unwrap(recipe.withoutLine(0))

      expect(one.lines.map((l) => l.quantity.grams)).toEqual([80])
      expect(one.withoutLine(0).ok).toBe(false)
    })

    it('refuse un ingrédient qui n’existe pas', () => {
      expect(recipe.withLineQuantity(5, Quantity.reconstitute(10)).ok).toBe(false)
      expect(recipe.withoutLine(-1).ok).toBe(false)
    })
  })
})
