import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { isErr, isOk } from '@/core/result'
import { FoodItem, FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'

const chicken = FoodItem.reconstitute({
  id: idFrom('f-chicken'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
  detailPer100g: NutrientDetail.reconstitute({
    fiberG: 0,
    sugarsG: 0.5,
    saturatedFatG: 3,
    saltG: 0.2,
  }),
  source: FoodSource.CIQUAL,
  tags: [FoodTag.CONTAINS_MEAT],
})

const entryOf = (item: FoodItem, grams: number): MealEntry => {
  const quantity = Quantity.create(grams)
  if (!isOk(quantity)) throw new Error('portion de test invalide')
  const entry = MealEntry.fromFoodItem(item, quantity.value)
  if (!isOk(entry)) throw new Error('ligne de test invalide')
  return entry.value
}

describe('MealEntry', () => {
  describe('fromFoodItem', () => {
    it('fige les macros mises à l’échelle de la portion', () => {
      const entry = entryOf(chicken, 150)

      expect(entry.macros.proteinG).toBe(30)
      expect(entry.macros.fatG).toBe(15)
      expect(entry.calories()).toBe(30 * 4 + 15 * 9)
    })

    it('fige le nom et les marqueurs de la fiche', () => {
      const entry = entryOf(chicken, 100)

      expect(entry.foodName).toBe('Blanc de poulet')
      expect(entry.hasTag(FoodTag.CONTAINS_MEAT)).toBe(true)
      expect(entry.hasTag(FoodTag.VEGAN)).toBe(false)
    })

    it('ne conserve que l’identifiant de la fiche, jamais la fiche elle-même', () => {
      const entry = entryOf(chicken, 100)

      expect(entry.foodItemId).toBe(chicken.id)
      expect(Object.values(entry)).not.toContain(chicken)
    })
  })

  describe('nutriments complémentaires', () => {
    it('les fige à l’échelle de la portion, comme les macros', () => {
      const entry = entryOf(chicken, 150)

      expect(entry.detail.saturatedFatG).toBeCloseTo(4.5, 9)
      expect(entry.detail.saltG).toBeCloseTo(0.3, 9)
      expect(entry.detail.sugarsG).toBeCloseTo(0.75, 9)
    })

    it('vaut zéro pour une fiche qui ne les renseigne pas', () => {
      // Une fiche Open Food Facts à moitié remplie doit rester utilisable : son
      // absence de données ne bloque pas la saisie, elle n'alimente rien.
      const bare = FoodItem.reconstitute({
        id: idFrom('f-bare'),
        name: 'Produit sans détail',
        macrosPer100g: Macros.reconstitute({ proteinG: 5, carbsG: 5, fatG: 5 }),
        source: FoodSource.OPEN_FOOD_FACTS,
      })

      expect(entryOf(bare, 200).detail.isZero()).toBe(true)
    })

    it('les remet à l’échelle depuis l’instantané quand la portion change', () => {
      const entry = entryOf(chicken, 100)

      const doubled = entry.withQuantity(Quantity.reconstitute(200))

      expect(isOk(doubled)).toBe(true)
      if (isOk(doubled)) {
        expect(doubled.value.detail.saturatedFatG).toBeCloseTo(6, 9)
        // L'original reste intact : la ligne est immuable.
        expect(entry.detail.saturatedFatG).toBeCloseTo(3, 9)
      }
    })

    it('survit à une correction de la fiche d’origine', () => {
      const entry = entryOf(chicken, 100)

      // La fiche est corrigée après coup ; l'instantané, lui, ne bouge pas.
      chicken.withMacros(Macros.reconstitute({ proteinG: 99, carbsG: 99, fatG: 99 }))

      expect(entry.detail.saltG).toBeCloseTo(0.2, 9)
    })
  })

  describe('immunité au catalogue', () => {
    it('reste inchangée lorsque la fiche d’origine est corrigée ensuite', () => {
      const entry = entryOf(chicken, 200)
      const before = { protein: entry.macros.proteinG, fat: entry.macros.fatG }

      // La fiche Ciqual est corrigée après coup : 31 g de protéines, 3 g de lipides.
      chicken.withMacros(Macros.reconstitute({ proteinG: 31, carbsG: 0, fatG: 3 }))

      expect(entry.macros.proteinG).toBe(before.protein)
      expect(entry.macros.fatG).toBe(before.fat)
    })

    it('ne partage pas le tableau de marqueurs avec la fiche', () => {
      const entry = entryOf(chicken, 100)

      expect(entry.snapshot.tags).not.toBe(chicken.tags)
      expect(entry.snapshot.tags).toEqual([...chicken.tags])
    })
  })

  describe('withQuantity', () => {
    it('remet les macros à l’échelle depuis l’instantané', () => {
      const entry = entryOf(chicken, 100)
      const doubled = Quantity.create(200)
      if (!isOk(doubled)) throw new Error('portion de test invalide')

      const updated = entry.withQuantity(doubled.value)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) {
        expect(updated.value.macros.proteinG).toBe(40)
        expect(updated.value.quantity.grams).toBe(200)
      }
    })

    it('recalcule depuis l’instantané et non depuis le catalogue corrigé', () => {
      const entry = entryOf(chicken, 100)
      // Une correction du catalogue ne doit pas s'inviter dans le recalcul.
      chicken.withMacros(Macros.reconstitute({ proteinG: 99, carbsG: 99, fatG: 99 }))
      const half = Quantity.create(50)
      if (!isOk(half)) throw new Error('portion de test invalide')

      const updated = entry.withQuantity(half.value)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) expect(updated.value.macros.proteinG).toBe(10)
    })

    it('ne mute pas l’instance d’origine', () => {
      const entry = entryOf(chicken, 100)
      const other = Quantity.create(250)
      if (!isOk(other)) throw new Error('portion de test invalide')

      const updated = entry.withQuantity(other.value)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) expect(updated.value).not.toBe(entry)
      expect(entry.quantity.grams).toBe(100)
      expect(entry.macros.proteinG).toBe(20)
    })

    it('conserve l’identifiant de la ligne', () => {
      const entry = entryOf(chicken, 100)
      const other = Quantity.create(120)
      if (!isOk(other)) throw new Error('portion de test invalide')

      const updated = entry.withQuantity(other.value)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) expect(updated.value.id).toBe(entry.id)
    })
  })

  it('réussit pour toute fiche et toute portion valides', () => {
    // La branche d'échec de `fromFoodItem` est défensive : `Quantity` garantit un
    // facteur fini et positif, donc `Macros.scale` ne peut pas échouer ici. Ce test
    // verrouille l'invariant plutôt que de simuler un état impossible.
    const quantity = Quantity.create(0.5)
    if (!isOk(quantity)) throw new Error('portion de test invalide')

    expect(isErr(MealEntry.fromFoodItem(chicken, quantity.value))).toBe(false)
  })

  it('compare par identité de ligne', () => {
    const a = entryOf(chicken, 100)
    const b = entryOf(chicken, 100)

    expect(a.equals(a)).toBe(true)
    expect(a.equals(b)).toBe(false)
  })

  it('se réhydrate sans revalider', () => {
    const entry = MealEntry.reconstitute({
      id: idFrom('e-1'),
      foodItemId: idFrom('f-1'),
      quantity: Quantity.reconstitute(100),
      snapshot: {
        foodName: 'Riz',
        macros: Macros.reconstitute({ proteinG: 7, carbsG: 78, fatG: 1 }),
        detail: NutrientDetail.reconstitute({
          fiberG: 1.4,
          sugarsG: 0.2,
          saturatedFatG: 0.3,
          saltG: 0.01,
        }),
        tags: [],
      },
    })

    expect(entry.foodName).toBe('Riz')
    expect(isErr(entry.withQuantity(Quantity.reconstitute(50)))).toBe(false)
  })
})
