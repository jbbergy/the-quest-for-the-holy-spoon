import { describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { isErr, isOk } from '@/core/result'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'

const playerId: PlayerId = idFrom('p-1')

const chicken = FoodItem.reconstitute({
  id: idFrom('f-chicken'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
  detailPer100g: NutrientDetail.reconstitute({
    fiberG: 0,
    sugarsG: 0,
    saturatedFatG: 3,
    saltG: 0.2,
  }),
  source: FoodSource.CIQUAL,
})

const rice = FoodItem.reconstitute({
  id: idFrom('f-rice'),
  name: 'Riz cuit',
  macrosPer100g: Macros.reconstitute({ proteinG: 2.5, carbsG: 28, fatG: 0.3 }),
  detailPer100g: NutrientDetail.reconstitute({
    fiberG: 1,
    sugarsG: 0.1,
    saturatedFatG: 0.1,
    saltG: 0.01,
  }),
  source: FoodSource.CIQUAL,
})

const quantityOf = (grams: number): Quantity => {
  const result = Quantity.create(grams)
  if (!isOk(result)) throw new Error('portion de test invalide')
  return result.value
}

const entryOf = (item: FoodItem, grams: number): MealEntry => {
  const result = MealEntry.fromFoodItem(item, quantityOf(grams))
  if (!isOk(result)) throw new Error('ligne de test invalide')
  return result.value
}

const mealOf = (entries: readonly MealEntry[] = []): Meal => {
  const result = Meal.create({ playerId, type: MealType.LUNCH, entries })
  if (!isOk(result)) throw new Error('repas de test invalide')
  return result.value
}

describe('Meal', () => {
  describe('create', () => {
    it('crée un repas vide daté de maintenant', () => {
      const result = Meal.create({ playerId, type: MealType.BREAKFAST })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.isEmpty).toBe(true)
        expect(result.value.entryCount).toBe(0)
        expect(result.value.playerId).toBe(playerId)
        expect(result.value.type).toBe(MealType.BREAKFAST)
      }
    })

    it('refuse une date invalide', () => {
      const result = Meal.create({
        playerId,
        type: MealType.LUNCH,
        loggedAt: new Date('pas une date'),
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
    })

    it('refuse un nombre de lignes déraisonnable', () => {
      const entries = Array.from({ length: 101 }, () => entryOf(rice, 100))
      const result = Meal.create({ playerId, type: MealType.LUNCH, entries })

      expect(isErr(result)).toBe(true)
    })

    it('copie la date pour ne pas exposer une référence mutable', () => {
      const loggedAt = new Date('2026-03-01T12:00:00.000Z')
      const result = Meal.create({ playerId, type: MealType.LUNCH, loggedAt })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        loggedAt.setFullYear(1999)
        expect(result.value.loggedAt.getUTCFullYear()).toBe(2026)
      }
    })
  })

  describe('calculateTotals', () => {
    it('vaut zéro pour un repas vide', () => {
      const totals = mealOf().calculateTotals()

      expect(totals.macros.isZero()).toBe(true)
      expect(totals.detail.isZero()).toBe(true)
      expect(totals.calories).toBe(0)
    })

    it('additionne les instantanés de toutes les lignes', () => {
      const meal = mealOf([entryOf(chicken, 150), entryOf(rice, 200)])

      const totals = meal.calculateTotals()

      expect(totals.macros.proteinG).toBeCloseTo(30 + 5, 10)
      expect(totals.macros.carbsG).toBeCloseTo(0 + 56, 10)
      expect(totals.macros.fatG).toBeCloseTo(15 + 0.6, 10)
      expect(totals.calories).toBeCloseTo(totals.macros.calories(), 10)

      // Les nutriments complémentaires s'additionnent sur le même principe.
      expect(totals.detail.saturatedFatG).toBeCloseTo(4.5 + 0.2, 10)
      expect(totals.detail.fiberG).toBeCloseTo(0 + 2, 10)
      expect(totals.detail.saltG).toBeCloseTo(0.3 + 0.02, 10)
    })

    it('n’intègre ni les sucres, ni les AG saturés, ni le sel aux calories', () => {
      /*
       * Verrou d'intention. Sucres et AG saturés sont déjà comptés dans les
       * glucides et les lipides ; les ajouter au calcul gonflerait l'énergie du
       * repas. Le sel, lui, n'apporte rien. Seules les macros font l'énergie.
       */
      const meal = mealOf([entryOf(chicken, 150), entryOf(rice, 200)])

      const totals = meal.calculateTotals()

      expect(totals.calories).toBeCloseTo(totals.macros.calories(), 10)
      expect(totals.detail.isZero()).toBe(false)
    })

    it('reste stable après correction du catalogue — l’historique ne se réécrit pas', () => {
      const meal = mealOf([entryOf(chicken, 100)])
      const before = meal.calculateTotals()

      chicken.withMacros(Macros.reconstitute({ proteinG: 31, carbsG: 0, fatG: 3 }))
      const after = meal.calculateTotals()

      expect(after.macros.equals(before.macros)).toBe(true)
      expect(after.detail.equals(before.detail)).toBe(true)
      expect(after.calories).toBe(before.calories)
    })
  })

  describe('addEntry', () => {
    it('retourne un nouveau repas sans muter l’original', () => {
      const meal = mealOf()
      const result = meal.addEntry(entryOf(chicken, 100))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).not.toBe(meal)
        expect(result.value.entryCount).toBe(1)
        expect(result.value.id).toBe(meal.id)
      }
      expect(meal.entryCount).toBe(0)
    })

    it('refuse une ligne déjà présente', () => {
      const entry = entryOf(chicken, 100)
      const meal = mealOf([entry])

      const result = meal.addEntry(entry)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
    })

    it('refuse au-delà de la limite de lignes', () => {
      const meal = mealOf(Array.from({ length: 100 }, () => entryOf(rice, 100)))

      expect(isErr(meal.addEntry(entryOf(chicken, 100)))).toBe(true)
    })
  })

  describe('removeEntry', () => {
    it('retire la ligne visée dans une nouvelle instance', () => {
      const kept = entryOf(rice, 100)
      const removed = entryOf(chicken, 100)
      const meal = mealOf([kept, removed])

      const result = meal.removeEntry(removed.id)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.entryCount).toBe(1)
        expect(result.value.entries[0]?.id).toBe(kept.id)
      }
      expect(meal.entryCount).toBe(2)
    })

    it('échoue si la ligne est absente', () => {
      const result = mealOf().removeEntry(idFrom('e-inconnue'))

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
    })
  })

  describe('changeEntryQuantity', () => {
    it('met la ligne à l’échelle et laisse les autres intactes', () => {
      const chickenEntry = entryOf(chicken, 100)
      const riceEntry = entryOf(rice, 100)
      const meal = mealOf([chickenEntry, riceEntry])

      const result = meal.changeEntryQuantity(chickenEntry.id, quantityOf(200))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.entries[0]?.macros.proteinG).toBe(40)
        expect(result.value.entries[1]?.id).toBe(riceEntry.id)
        expect(result.value.entryCount).toBe(2)
      }
      expect(meal.entries[0]?.macros.proteinG).toBe(20)
    })

    it('échoue si la ligne est absente', () => {
      const result = mealOf().changeEntryQuantity(idFrom('e-inconnue'), quantityOf(100))

      expect(isErr(result)).toBe(true)
    })
  })

  describe('retype', () => {
    it('change le type dans une nouvelle instance', () => {
      const meal = mealOf([entryOf(rice, 100)])
      const snack = meal.retype(MealType.SNACK)

      expect(snack).not.toBe(meal)
      expect(snack.type).toBe(MealType.SNACK)
      expect(snack.entryCount).toBe(1)
      expect(meal.type).toBe(MealType.LUNCH)
    })
  })

  it('expose une liste de lignes gelée', () => {
    const meal = mealOf([entryOf(rice, 100)])

    expect(Object.isFrozen(meal.entries)).toBe(true)
  })

  it('se réhydrate sans revalider', () => {
    const meal = Meal.reconstitute({
      id: idFrom('m-1'),
      playerId,
      type: MealType.DINNER,
      loggedAt: new Date('2026-01-01T20:00:00.000Z'),
      entries: [entryOf(rice, 150)],
      consumedAt: null,
    })

    expect(meal.entryCount).toBe(1)
    expect(meal.calculateTotals().macros.carbsG).toBeCloseTo(42, 10)
  })
})

describe('état « pris »', () => {
  it('naît prévu, jamais pris', () => {
    // Composer un repas ne doit rien changer aux jauges de la journée.
    expect(mealOf([entryOf(rice, 100)]).isConsumed).toBe(false)
    expect(mealOf([entryOf(rice, 100)]).consumedAt).toBeNull()
  })

  it('markConsumed retourne un nouveau repas sans toucher à l’original', () => {
    const original = mealOf([entryOf(rice, 100)])

    const eaten = original.markConsumed(new Date('2026-04-10T12:45:00.000Z'))

    expect(isOk(eaten)).toBe(true)
    if (isOk(eaten)) {
      expect(eaten.value).not.toBe(original)
      expect(eaten.value.id).toBe(original.id)
      expect(eaten.value.consumedAt?.toISOString()).toBe('2026-04-10T12:45:00.000Z')
    }
    expect(original.isConsumed).toBe(false)
  })

  it('copie la date reçue', () => {
    const at = new Date('2026-04-10T12:45:00.000Z')
    const eaten = mealOf([entryOf(rice, 100)]).markConsumed(at)

    at.setFullYear(1999)

    // Sans copie, l'appelant pourrait réécrire l'heure du repas après coup.
    if (isOk(eaten)) expect(eaten.value.consumedAt?.getFullYear()).toBe(2026)
  })

  it('refuse de marquer un repas vide', () => {
    const result = mealOf([]).markConsumed()

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('refuse un second marquage', () => {
    const eaten = mealOf([entryOf(rice, 100)]).markConsumed()
    if (!isOk(eaten)) throw new Error('marquage initial échoué')

    const again = eaten.value.markConsumed()

    // C'est ce refus qui permet de ne récompenser qu'une fois le même repas.
    expect(isErr(again)).toBe(true)
  })

  it('refuse une date de consommation invalide', () => {
    const result = mealOf([entryOf(rice, 100)]).markConsumed(new Date('pas une date'))

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('markNotConsumed ramène le repas à l’état prévu', () => {
    const eaten = mealOf([entryOf(rice, 100)]).markConsumed()
    if (!isOk(eaten)) throw new Error('marquage initial échoué')

    const cancelled = eaten.value.markNotConsumed()

    expect(isOk(cancelled)).toBe(true)
    if (isOk(cancelled)) expect(cancelled.value.consumedAt).toBeNull()
    expect(eaten.value.isConsumed).toBe(true)
  })

  it('refuse d’annuler un repas qui n’est pas pris', () => {
    expect(isErr(mealOf([entryOf(rice, 100)]).markNotConsumed())).toBe(true)
  })

  describe('un repas pris n’est plus modifiable', () => {
    const eatenMeal = (entry: MealEntry): Meal => {
      const eaten = mealOf([entry]).markConsumed()
      if (!isOk(eaten)) throw new Error('marquage initial échoué')
      return eaten.value
    }

    it('refuse l’ajout d’une ligne', () => {
      const result = eatenMeal(entryOf(rice, 100)).addEntry(entryOf(chicken, 150))

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
    })

    it('refuse le retrait d’une ligne', () => {
      const entry = entryOf(rice, 100)

      expect(isErr(eatenMeal(entry).removeEntry(entry.id))).toBe(true)
    })

    it('refuse la correction d’une portion', () => {
      const entry = entryOf(rice, 100)

      const result = eatenMeal(entry).changeEntryQuantity(entry.id, quantityOf(200))

      expect(isErr(result)).toBe(true)
    })

    it('redevient modifiable une fois « pris » annulé', () => {
      // Le détour est le propos : corriger une journée déjà vécue doit être un
      // geste délibéré, pas un effet de bord d'une saisie.
      const entry = entryOf(rice, 100)
      const cancelled = eatenMeal(entry).markNotConsumed()
      if (!isOk(cancelled)) throw new Error('annulation échouée')

      expect(isOk(cancelled.value.changeEntryQuantity(entry.id, quantityOf(200)))).toBe(true)
    })

    it('ne laisse aucune porte vers un repas vide et pourtant mangé', () => {
      /*
       * L'invariant tient toujours, par les deux bouts : `markConsumed` refuse
       * un repas vide, et un repas pris refuse de se vider. `withEntries` n'a
       * donc plus à remettre `consumedAt` à zéro — ce chemin était devenu
       * inatteignable.
       */
      const entry = entryOf(rice, 100)

      expect(isErr(eatenMeal(entry).removeEntry(entry.id))).toBe(true)
      expect(isErr(mealOf([]).markConsumed())).toBe(true)
    })
  })

  it('conserve l’état à travers un changement de type', () => {
    const eaten = mealOf([entryOf(rice, 100)]).markConsumed()
    if (!isOk(eaten)) throw new Error('marquage initial échoué')

    expect(eaten.value.retype(MealType.SNACK).isConsumed).toBe(true)
  })
})
