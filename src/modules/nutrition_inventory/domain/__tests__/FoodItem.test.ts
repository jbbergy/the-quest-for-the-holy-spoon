import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { isErr, isOk } from '@/core/result'
import { FoodItem, FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'

const per100g = Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 })

const validProps = {
  name: 'Blanc de poulet',
  macrosPer100g: per100g,
  source: FoodSource.CIQUAL,
}

describe('FoodItem', () => {
  describe('create', () => {
    it('crée une fiche valide et lui attribue un identifiant', () => {
      const result = FoodItem.create(validProps)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.name).toBe('Blanc de poulet')
        expect(result.value.id).toBeTypeOf('string')
        expect(result.value.tags).toEqual([])
      }
    })

    it('normalise le nom en retirant les espaces de bord', () => {
      const result = FoodItem.create({ ...validProps, name: '  Lentilles  ' })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.name).toBe('Lentilles')
    })

    it.each(['', '   '])('refuse un nom vide (%p)', (name) => {
      const result = FoodItem.create({ ...validProps, name })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_FOOD_ITEM')
    })

    it('refuse un nom trop long', () => {
      const result = FoodItem.create({ ...validProps, name: 'a'.repeat(201) })

      expect(isErr(result)).toBe(true)
    })

    it('accepte un code-barres EAN plausible', () => {
      const result = FoodItem.create({ ...validProps, barcode: '3017620422003' })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.barcode).toBe('3017620422003')
    })

    it.each(['123', 'abcdefgh', '123456789012345'])(
      'refuse le code-barres invalide %p',
      (barcode) => {
        const result = FoodItem.create({ ...validProps, barcode })

        expect(isErr(result)).toBe(true)
        if (isErr(result)) expect(result.error.code).toBe('INVALID_FOOD_ITEM')
      },
    )

    it('déduplique les marqueurs diététiques', () => {
      const result = FoodItem.create({
        ...validProps,
        tags: [FoodTag.GLUTEN_FREE, FoodTag.GLUTEN_FREE, FoodTag.CONTAINS_MEAT],
      })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.tags).toEqual([FoodTag.GLUTEN_FREE, FoodTag.CONTAINS_MEAT])
      }
    })
  })

  describe('macrosForGrams', () => {
    it('met les macros à l’échelle de la portion', () => {
      const item = FoodItem.reconstitute({
        id: idFrom('f-1'),
        name: 'Poulet',
        macrosPer100g: per100g,
        source: FoodSource.CIQUAL,
      })

      const result = item.macrosForGrams(150)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.proteinG).toBe(30)
        expect(result.value.fatG).toBe(15)
      }
    })

    it('refuse une portion négative', () => {
      const item = FoodItem.reconstitute({
        id: idFrom('f-1'),
        name: 'Poulet',
        macrosPer100g: per100g,
        source: FoodSource.CIQUAL,
      })

      expect(isErr(item.macrosForGrams(-10))).toBe(true)
    })
  })

  describe('immutabilité', () => {
    it('withMacros retourne une nouvelle instance sans toucher à l’originale', () => {
      const original = FoodItem.reconstitute({
        id: idFrom('f-1'),
        name: 'Poulet',
        macrosPer100g: per100g,
        source: FoodSource.CIQUAL,
      })

      const corrected = original.withMacros(
        Macros.reconstitute({ proteinG: 31, carbsG: 0, fatG: 3 }),
      )

      expect(corrected).not.toBe(original)
      expect(original.macrosPer100g.proteinG).toBe(20)
      expect(corrected.macrosPer100g.proteinG).toBe(31)
      expect(corrected.id).toBe(original.id)
    })

    it('rename retourne une nouvelle instance et conserve l’identifiant', () => {
      const original = FoodItem.reconstitute({
        id: idFrom('f-1'),
        name: 'Poulet',
        macrosPer100g: per100g,
        source: FoodSource.CIQUAL,
        barcode: '3017620422003',
      })

      const renamed = original.rename('Blanc de poulet')

      expect(isOk(renamed)).toBe(true)
      if (isOk(renamed)) {
        expect(renamed.value).not.toBe(original)
        expect(renamed.value.id).toBe(original.id)
        expect(renamed.value.barcode).toBe('3017620422003')
        expect(original.name).toBe('Poulet')
      }
    })

    it('rename propage l’échec de validation', () => {
      const original = FoodItem.reconstitute({
        id: idFrom('f-1'),
        name: 'Poulet',
        macrosPer100g: per100g,
        source: FoodSource.CIQUAL,
      })

      expect(isErr(original.rename('  '))).toBe(true)
    })
  })

  it('compare par identité, pas par valeur', () => {
    const a = FoodItem.reconstitute({
      id: idFrom('f-1'),
      name: 'Poulet',
      macrosPer100g: per100g,
      source: FoodSource.CIQUAL,
    })
    const sameId = a.withMacros(Macros.zero())
    const other = FoodItem.reconstitute({
      id: idFrom('f-2'),
      name: 'Poulet',
      macrosPer100g: per100g,
      source: FoodSource.CIQUAL,
    })

    expect(a.equals(sameId)).toBe(true)
    expect(a.equals(other)).toBe(false)
  })

  it('expose ses marqueurs diététiques', () => {
    const item = FoodItem.reconstitute({
      id: idFrom('f-1'),
      name: 'Poulet',
      macrosPer100g: per100g,
      source: FoodSource.CIQUAL,
      tags: [FoodTag.CONTAINS_MEAT],
    })

    expect(item.hasTag(FoodTag.CONTAINS_MEAT)).toBe(true)
    expect(item.hasTag(FoodTag.VEGAN)).toBe(false)
  })
})
