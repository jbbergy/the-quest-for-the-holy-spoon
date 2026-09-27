import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'

import { GRAM_UNIT, listKey, mealItemId, ShoppingItem } from '../ShoppingItem'

import { ALEX, CAMILLE, EGG, HOUSEHOLD_LIST, PERSONAL_LIST, SACHA, WEEK } from './fixtures'

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error
  return result.value
}

const eggs = () =>
  unwrap(ShoppingItem.fromMeals(HOUSEHOLD_LIST, { foodItemId: idFrom('oeuf'), name: 'Œuf', unit: EGG }))

describe('ShoppingItem', () => {
  it('écrit à la main : un nom propre, sans quantité ni aliment', () => {
    const item = unwrap(ShoppingItem.manual(PERSONAL_LIST, '  pain   de mie '))

    expect(item.name).toBe('pain de mie')
    expect(item.isManual).toBe(true)
    expect(item.totalGrams).toBe(0)
    expect(item.checked).toBe(false)
    expect(item.householdId).toBeNull()
    expect(item.week).toBe(WEEK)
  })

  it('garde une quantité écrite librement, nettoyée ; vide, elle n’existe pas', () => {
    expect(unwrap(ShoppingItem.manual(PERSONAL_LIST, 'Lessive', '  1   bidon ')).quantityText).toBe('1 bidon')
    expect(unwrap(ShoppingItem.manual(PERSONAL_LIST, 'Lessive', '   ')).quantityText).toBeNull()
    expect(unwrap(ShoppingItem.manual(PERSONAL_LIST, 'Lessive')).quantityText).toBeNull()
  })

  it('refuse une quantité trop longue', () => {
    const result = ShoppingItem.manual(PERSONAL_LIST, 'Lessive', 'x'.repeat(31))

    expect(!result.ok && result.error.code).toBe('INVALID_SHOPPING_ITEM')
  })

  it.each(['', '   ', 'x'.repeat(81)])('refuse le nom « %s »', (name) => {
    const result = ShoppingItem.manual(PERSONAL_LIST, name)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('INVALID_SHOPPING_ITEM')
  })

  it('refuse aussi un aliment sans nom', () => {
    expect(ShoppingItem.fromMeals(PERSONAL_LIST, { foodItemId: idFrom('x'), name: ' ', unit: GRAM_UNIT }).ok).toBe(false)
  })

  it('tiré des repas : le même identifiant pour tout le foyer, distinct d’une semaine à l’autre', () => {
    const item = eggs()

    expect(item.id).toBe(mealItemId(HOUSEHOLD_LIST, idFrom('oeuf')))
    expect(item.id).toBe('foyer-1:2026-09-28:oeuf')
    expect(mealItemId({ ...HOUSEHOLD_LIST, week: '2026-10-05' as typeof WEEK }, idFrom('oeuf'))).not.toBe(item.id)
    expect(listKey(PERSONAL_LIST)).toBe(CAMILLE)
  })

  it('additionne les parts, et compte dans son unité', () => {
    const item = eggs().withContributions(
      new Set([CAMILLE, ALEX]),
      new Map([
        [CAMILLE, 120],
        [ALEX, 240],
      ]),
      EGG,
    )

    expect(item.totalGrams).toBe(360)
    expect(item.amount).toBe(6)
  })

  it('ne remplace que les parts des personnes comptées', () => {
    const before = eggs().withContributions(
      new Set([CAMILLE, ALEX]),
      new Map([
        [CAMILLE, 120],
        [ALEX, 240],
      ]),
      EGG,
    )

    // Seule Camille est relue : elle n'en veut plus. Sacha, lue aussi, n'en a jamais voulu.
    const after = before.withContributions(new Set([CAMILLE, SACHA]), new Map([[SACHA, 0]]), EGG)

    expect([...after.contributions]).toEqual([[ALEX, 240]])
  })

  it('décoche un article dont il faut davantage, pas un article dont il faut moins', () => {
    const bought = eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 120]]), EGG).check()

    expect(bought.withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 60]]), EGG).checked).toBe(true)
    expect(bought.withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 180]]), EGG).checked).toBe(false)
  })

  it('cocher deux fois ne change rien', () => {
    const item = eggs()
    const checked = item.check()

    expect(item.uncheck()).toBe(item)
    expect(checked.check()).toBe(checked)
    expect(checked.uncheck().checked).toBe(false)
  })

  it('compare le contenu, pas l’identité', () => {
    const a = eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 60]]), EGG)
    const same = eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 60]]), EGG)

    expect(a.sameAs(same)).toBe(true)
    expect(a.sameAs(a.check())).toBe(false)
    expect(a.sameAs(eggs().withContributions(new Set([ALEX]), new Map([[ALEX, 60]]), EGG))).toBe(false)
    expect(a.sameAs(eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 60]]), GRAM_UNIT))).toBe(false)
  })
})

describe('ShoppingItem — ajout à la main', () => {
  it('s’additionne aux parts des repas, que le remplissage laisse en place', () => {
    const fromMeals = eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 120]]), EGG)

    const added = unwrap(fromMeals.addByHand(60, EGG))
    const refilled = added.withContributions(new Set([CAMILLE]), new Map(), EGG)

    expect(added.amount).toBe(3)
    expect(refilled.totalGrams).toBe(60)
    expect(added.sameAs(fromMeals)).toBe(false)
  })

  it('repasse en grammes si l’unité diffère, garde la sienne sur un article vide', () => {
    const fromMeals = eggs().withContributions(new Set([CAMILLE]), new Map([[CAMILLE, 120]]), EGG)

    expect(unwrap(fromMeals.addByHand(50, GRAM_UNIT)).unit).toEqual(GRAM_UNIT)
    expect(unwrap(eggs().addByHand(60, EGG)).unit).toEqual(EGG)
  })

  it('décoche un article dont on ajoute davantage', () => {
    expect(unwrap(eggs().check().addByHand(60, EGG)).checked).toBe(false)
  })

  it('refuse une quantité nulle, et un article sans aliment', () => {
    expect(eggs().addByHand(0, EGG).ok).toBe(false)
    expect(eggs().addByHand(Number.NaN, EGG).ok).toBe(false)
    expect(unwrap(ShoppingItem.manual(PERSONAL_LIST, 'Lessive')).addByHand(10, GRAM_UNIT).ok).toBe(false)
  })
})
