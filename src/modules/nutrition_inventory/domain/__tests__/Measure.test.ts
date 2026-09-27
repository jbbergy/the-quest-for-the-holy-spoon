import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { Quantity } from '@/core/nutrition/Quantity'
import { isErr, isOk } from '@/core/result'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import {
  createServing,
  GRAM,
  scaleAmount,
  validateServings,
} from '@/modules/nutrition_inventory/domain/Measure'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'

const milk = FoodItem.reconstitute({
  id: idFrom('ciqual:19051'),
  name: 'Lait demi-écrémé, UHT',
  macrosPer100g: Macros.reconstitute({ proteinG: 3.3, carbsG: 4.8, fatG: 1.6 }),
  source: FoodSource.CIQUAL,
  unit: 'ml',
  density: 1.03,
  servings: [{ label: 'verre', grams: 206, approximate: true }],
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

describe('createServing', () => {
  it('nettoie le nom et garde le poids', () => {
    expect(unwrap(createServing('  part   de gâteau ', 120))).toEqual({
      label: 'part de gâteau',
      grams: 120,
      approximate: false,
    })
  })

  it.each([
    ['', 100],
    ['part', 0],
    ['part', -3],
    ['part', Number.NaN],
    ['part', 20_000],
    ['g', 1],
    ['ML', 1],
    ['x'.repeat(41), 10],
  ])('refuse %p de %p g', (label, grams) => {
    expect(isErr(createServing(label, grams))).toBe(true)
  })
})

describe('validateServings', () => {
  it('refuse deux portions du même nom, casse comprise', () => {
    const result = validateServings([
      { label: 'Tranche', grams: 25, approximate: false },
      { label: 'tranche', grams: 30, approximate: false },
    ])
    expect(isErr(result)).toBe(true)
  })

  it('refuse une liste trop longue pour rester lisible', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      label: `portion ${index}`,
      grams: 10,
      approximate: false,
    }))
    expect(isErr(validateServings(many))).toBe(true)
  })
})

describe('scaleAmount', () => {
  const egg = { label: 'œuf', grams: 50, countable: true, approximate: true }

  it('arrondit une portion comptée à la demi-portion, jamais à zéro', () => {
    expect(scaleAmount(2, 1.2, egg)).toBe(2.5)
    expect(scaleAmount(1, 0.1, egg)).toBe(0.5)
  })

  it('arrondit grammes et millilitres à 5 près', () => {
    expect(scaleAmount(200, 1.13, GRAM)).toBe(225)
  })
})

describe('FoodItem — mesures', () => {
  it('propose sa mesure de base en tête, puis ses portions', () => {
    expect(milk.measures).toEqual([
      { label: 'ml', grams: 1.03, countable: false, approximate: false },
      { label: 'verre', grams: 206, countable: true, approximate: true },
    ])
  })

  it('retrouve une mesure par son nom, la mesure de base sinon', () => {
    expect(milk.measureNamed('verre').grams).toBe(206)
    expect(milk.measureNamed('bol').label).toBe('ml')
    expect(milk.measureNamed(undefined).label).toBe('ml')
  })

  it('reste en grammes, sans portion, par défaut', () => {
    const plain = unwrap(
      FoodItem.create({
        name: 'Riz',
        macrosPer100g: Macros.reconstitute({ proteinG: 2.5, carbsG: 28, fatG: 0.3 }),
        source: FoodSource.USER,
      }),
    )
    expect(plain.measures).toEqual([GRAM])
  })

  it('ignore une densité pour une fiche en grammes, refuse une densité absurde', () => {
    const base = {
      name: 'Huile',
      macrosPer100g: Macros.reconstitute({ proteinG: 0, carbsG: 0, fatG: 100 }),
      source: FoodSource.USER,
    }
    expect(unwrap(FoodItem.create({ ...base, density: 0.92 })).density).toBe(1)
    expect(isErr(FoodItem.create({ ...base, unit: 'ml', density: 12 }))).toBe(true)
  })

  it('change de portions sans rien perdre du reste', () => {
    const updated = unwrap(milk.withPortions({ servings: [] }))
    expect(updated.id).toBe(milk.id)
    expect(updated.unit).toBe('ml')
    expect(updated.servings).toEqual([])
    // Les autres transformations gardent les portions.
    expect(milk.withMacros(Macros.zero()).servings).toHaveLength(1)
  })
})

describe('MealEntry — mesure', () => {
  const glass = milk.measureNamed('verre')
  const entry = unwrap(
    MealEntry.fromFoodItem(milk, unwrap(Quantity.create(412)), undefined, glass),
  )

  it('exprime la quantité dans la mesure de saisie', () => {
    expect(entry.amount).toBe(2)
    expect(entry.measure.label).toBe('verre')
  })

  it('garde sa mesure quand la portion change ou que la fiche est relue', () => {
    const changed = unwrap(entry.withQuantity(unwrap(Quantity.create(103))))
    expect(changed.measure.label).toBe('verre')
    expect(changed.amount).toBe(0.5)

    const refreshed = entry.refreshedFrom(milk)
    expect(isOk(refreshed) && refreshed.value.measure.label).toBe('verre')
  })

  it('prend la mesure de base de la fiche faute de précision', () => {
    const plain = unwrap(MealEntry.fromFoodItem(milk, unwrap(Quantity.create(103))))
    expect(plain.measure.label).toBe('ml')
    expect(plain.amount).toBe(100)
  })
})
