import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'

import { GRAM_UNIT, ShoppingItem } from '../ShoppingItem'
import { fillShoppingList } from '../ShoppingListFiller'

import { ALEX, CAMILLE, demandOf, EGG, HOUSEHOLD_LIST, line, SACHA } from './fixtures'

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error
  return result.value
}

const fill = (existing: readonly ShoppingItem[], demand: Parameters<typeof fillShoppingList>[2]) =>
  unwrap(fillShoppingList(HOUSEHOLD_LIST, existing, demand))

const byName = (items: readonly ShoppingItem[]) =>
  Object.fromEntries(items.map((item) => [item.name, item]))

describe('fillShoppingList', () => {
  it('regroupe un aliment de plusieurs repas et de plusieurs personnes en une ligne', () => {
    const plan = fill(
      [],
      demandOf([
        [CAMILLE, [line('riz', 80, GRAM_UNIT, 'Riz'), line('riz', 70, GRAM_UNIT, 'Riz')]],
        [ALEX, [line('riz', 100, GRAM_UNIT, 'Riz'), line('pomme', 150, GRAM_UNIT, 'Pomme')]],
      ]),
    )

    const items = byName(plan.save)
    expect(Object.keys(items).sort()).toEqual(['Pomme', 'Riz'])
    expect(items.Riz?.totalGrams).toBe(250)
    expect([...(items.Riz?.contributions ?? [])]).toEqual([
      [CAMILLE, 150],
      [ALEX, 100],
    ])
  })

  it('compte en portions quand elles sont toutes pareilles, sinon en grammes', () => {
    const plan = fill(
      [],
      demandOf([
        [CAMILLE, [line('oeuf', 120, EGG, 'Œuf'), line('pain', 50, EGG, 'Pain')]],
        [ALEX, [line('oeuf', 60, EGG, 'Œuf'), line('pain', 40, GRAM_UNIT, 'Pain')]],
      ]),
    )

    const items = byName(plan.save)
    expect(items['Œuf']?.unit).toEqual(EGG)
    expect(items['Œuf']?.amount).toBe(3)
    expect(items.Pain?.unit).toEqual(GRAM_UNIT)
  })

  it('ignore les lignes sans quantité', () => {
    expect(fill([], demandOf([[CAMILLE, [line('sel', 0)]]])).save).toEqual([])
  })

  it('n’écrit rien quand la liste est déjà à jour', () => {
    const demand = demandOf([[CAMILLE, [line('riz', 80)]]])
    const first = fill([], demand).save

    expect(fill(first, demand)).toEqual({ save: [] })
  })

  it('garde la part des personnes qu’on n’a pas pu lire', () => {
    const existing = fill([], demandOf([
      [CAMILLE, [line('riz', 80)]],
      [ALEX, [line('riz', 100), line('lait', 200)]],
    ])).save

    // Alex n'est pas relu cette fois (hors ligne, ou journées non partagées).
    const plan = fill(existing, demandOf([[CAMILLE, [line('riz', 50)]]]))

    expect(plan.save.map((item) => [item.name, item.totalGrams])).toEqual([['riz', 150]])
  })

  it('ne retire jamais un article dont plus personne n’a besoin : sa quantité s’efface', () => {
    const [riz, lait] = fill([], demandOf([[CAMILLE, [line('riz', 80), line('lait', 200)]]])).save
    const bought = lait!.check()

    const plan = fill([riz!, bought], demandOf([[CAMILLE, []]]))

    expect(plan.save.map((item) => [item.name, item.totalGrams, item.checked])).toEqual([
      ['riz', 0, false],
      ['lait', 0, true],
    ])
    // Remplir encore n'y change plus rien.
    expect(fill(plan.save, demandOf([[CAMILLE, []]]))).toEqual({ save: [] })
  })

  it('ne touche jamais aux articles écrits à la main', () => {
    const bread = unwrap(ShoppingItem.manual(HOUSEHOLD_LIST, 'Lessive'))

    expect(fill([bread], demandOf([[CAMILLE, []]]))).toEqual({ save: [] })
  })

  it('repasse en grammes si les autres parts ont été saisies dans une autre unité', () => {
    const existing = fill([], demandOf([[ALEX, [line('oeuf', 120, GRAM_UNIT)]]])).save

    const [item] = fill(existing, demandOf([[CAMILLE, [line('oeuf', 60, EGG)]]])).save

    expect(item?.unit).toEqual(GRAM_UNIT)
    expect(item?.totalGrams).toBe(180)
  })

  it('prend l’unité nouvelle quand plus personne d’autre n’a de part', () => {
    const existing = fill([], demandOf([[CAMILLE, [line('oeuf', 120, GRAM_UNIT)]]])).save

    const [item] = fill(existing, demandOf([[CAMILLE, [line('oeuf', 120, EGG)]], [SACHA, []]])).save

    expect(item?.unit).toEqual(EGG)
  })

  it('crée un article du nom de l’aliment, et refuse un nom vide', () => {
    expect(fillShoppingList(HOUSEHOLD_LIST, [], demandOf([[CAMILLE, [line('x', 10, GRAM_UNIT, ' ')]]])).ok).toBe(false)
    const [item] = fill([], demandOf([[CAMILLE, [line('x', 10, GRAM_UNIT, 'Carotte')]]])).save
    expect(item?.foodItemId).toBe(idFrom('x'))
  })
})

describe('fillShoppingList — ajouts à la main', () => {
  it('garde la quantité ajoutée à la main, et passe en grammes si les unités diffèrent', () => {
    const byHand = unwrap(
      unwrap(ShoppingItem.fromMeals(HOUSEHOLD_LIST, { foodItemId: idFrom('oeuf'), name: 'Œuf', unit: GRAM_UNIT })).addByHand(
        100,
        GRAM_UNIT,
      ),
    )

    const [item] = fill([byHand], demandOf([[CAMILLE, [line('oeuf', 120, EGG)]]])).save

    expect(item?.totalGrams).toBe(220)
    expect(item?.unit).toEqual(GRAM_UNIT)
    expect(fill([byHand], demandOf([[CAMILLE, []]]))).toEqual({ save: [] })
  })
})
