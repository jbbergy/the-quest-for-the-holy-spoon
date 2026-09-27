import { describe, expect, it } from 'vitest'

import { RepositoryError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { err } from '@/core/result'

import {
  ALEX,
  CAMILLE,
  demandOf,
  EGG,
  GRAM,
  HOUSEHOLD_LIST,
  line,
  PERSONAL_LIST,
} from '../../domain/__tests__/fixtures'
import type { IShoppingItemRepository } from '../../domain/repositories'
import { InMemoryShoppingRepository } from '../../infrastructure/InMemoryShoppingRepository'
import {
  AddFoodToShoppingListUseCase,
  AddShoppingItemUseCase,
  CheckShoppingItemUseCase,
  FillShoppingListUseCase,
  GetShoppingListUseCase,
  RemoveShoppingItemsUseCase,
} from '../useCases'

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error
  return result.value
}

function setup(items: IShoppingItemRepository = new InMemoryShoppingRepository()) {
  return {
    get: new GetShoppingListUseCase(items),
    fill: new FillShoppingListUseCase(items),
    add: new AddShoppingItemUseCase(items),
    addFood: new AddFoodToShoppingListUseCase(items),
    check: new CheckShoppingItemUseCase(items),
    remove: new RemoveShoppingItemsUseCase(items),
  }
}

/** Stockage en panne : toute lecture et toute écriture échouent. */
const broken: IShoppingItemRepository = {
  findByList: async () => err(new RepositoryError('STORAGE_UNAVAILABLE', 'panne')),
  findById: async () => err(new RepositoryError('STORAGE_UNAVAILABLE', 'panne')),
  saveAll: async () => err(new RepositoryError('STORAGE_UNAVAILABLE', 'panne')),
  deleteAll: async () => err(new RepositoryError('STORAGE_UNAVAILABLE', 'panne')),
}

/** Le même stockage, dont une seule opération tombe en panne. */
function failing(
  memory: InMemoryShoppingRepository,
  broken: 'saveAll' | 'deleteAll',
): IShoppingItemRepository {
  return {
    findByList: (list) => memory.findByList(list),
    findById: (id) => memory.findById(id),
    saveAll: (items) => memory.saveAll(items),
    deleteAll: (ids) => memory.deleteAll(ids),
    [broken]: async () => err(new RepositoryError('STORAGE_UNAVAILABLE', 'panne')),
  }
}

describe('Liste de courses', () => {
  it('se remplit avec les repas, puis se lit par ordre alphabétique', async () => {
    const shop = setup()

    const outcome = unwrap(
      await shop.fill.execute(
        HOUSEHOLD_LIST,
        demandOf([
          [CAMILLE, [line('riz', 80, undefined, 'Riz'), line('oeuf', 120, EGG, 'œuf')]],
          [ALEX, [line('riz', 100, undefined, 'Riz')]],
        ]),
      ),
    )
    const list = unwrap(await shop.get.execute(HOUSEHOLD_LIST))

    expect(outcome).toEqual({ added: 2, updated: 0 })
    expect(list.householdId).toBe(HOUSEHOLD_LIST.householdId)
    expect(list.items.map((item) => [item.name, item.amount])).toEqual([
      ['œuf', 2],
      ['Riz', 180],
    ])
    expect(list.items[1]?.neededBy).toEqual([CAMILLE, ALEX])
  })

  it('compte ce qui change au remplissage suivant', async () => {
    const shop = setup()
    await shop.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('riz', 80), line('lait', 200)]]]))

    const outcome = unwrap(
      await shop.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('riz', 100), line('pain', 50)]]])),
    )

    // Le lait n'est plus demandé : il reste, sans quantité.
    expect(outcome).toEqual({ added: 1, updated: 2 })
    const list = unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items
    expect(list.map((item) => [item.name, item.grams])).toEqual([
      ['lait', 0],
      ['pain', 50],
      ['riz', 100],
    ])
  })

  it('ne mélange pas la liste du foyer et la liste personnelle', async () => {
    const shop = setup()
    unwrap(await shop.add.execute(HOUSEHOLD_LIST, 'Lessive'))
    unwrap(await shop.add.execute(PERSONAL_LIST, 'Chocolat'))

    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items.map((item) => item.name)).toEqual(['Lessive'])
    expect(unwrap(await shop.get.execute(PERSONAL_LIST)).items.map((item) => item.name)).toEqual(['Chocolat'])
  })

  it('ajoute un article sans aliment avec sa quantité écrite', async () => {
    const shop = setup()

    const view = unwrap(await shop.add.execute(HOUSEHOLD_LIST, 'Lessive', '1 bidon'))

    expect(view.quantityText).toBe('1 bidon')
    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items[0]?.quantityText).toBe('1 bidon')
  })

  it('refuse un article sans nom', async () => {
    const result = await setup().add.execute(HOUSEHOLD_LIST, '  ')

    expect(!result.ok && result.error.code).toBe('INVALID_SHOPPING_ITEM')
  })

  it('coche, décoche et retire un article', async () => {
    const shop = setup()
    const bread = unwrap(await shop.add.execute(HOUSEHOLD_LIST, 'Pain'))

    unwrap(await shop.check.execute(bread.id, true))
    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items[0]?.checked).toBe(true)
    unwrap(await shop.check.execute(bread.id, true))
    unwrap(await shop.check.execute(bread.id, false))
    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items[0]?.checked).toBe(false)

    unwrap(await shop.remove.execute([bread.id]))
    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items).toEqual([])
  })

  it('signale un article qu’un autre membre a déjà retiré', async () => {
    const result = await setup().check.execute(idFrom('parti'), true)

    expect(!result.ok && result.error.code).toBe('SHOPPING_ITEM_NOT_FOUND')
  })

  it('traduit une panne de stockage en erreur d’application', async () => {
    const shop = setup(broken)

    const codes = [
      await shop.get.execute(HOUSEHOLD_LIST),
      await shop.fill.execute(HOUSEHOLD_LIST, demandOf([])),
      await shop.add.execute(HOUSEHOLD_LIST, 'Pain'),
      await shop.addFood.execute(HOUSEHOLD_LIST, { foodItemId: idFrom('riz'), name: 'Riz', grams: 80, unit: EGG }),
      await shop.check.execute(idFrom('x'), true),
      await shop.remove.execute([idFrom('x')]),
    ].map((result) => (!result.ok ? result.error.code : 'ok'))

    expect(codes).toEqual([
      'SHOPPING_LIST_UNREADABLE',
      'SHOPPING_LIST_UNREADABLE',
      'SHOPPING_LIST_NOT_SAVED',
      'SHOPPING_LIST_UNREADABLE',
      'SHOPPING_LIST_UNREADABLE',
      'SHOPPING_LIST_NOT_SAVED',
    ])
  })

  it('signale un échec d’écriture pendant le remplissage et au cochage', async () => {
    const memory = new InMemoryShoppingRepository()
    const shop = setup(memory)
    const bread = unwrap(await shop.add.execute(HOUSEHOLD_LIST, 'Pain'))
    unwrap(await shop.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('riz', 80)]]])))

    const noWrites = setup(failing(memory, 'saveAll'))
    const noDeletes = setup(failing(memory, 'deleteAll'))
    const filled = await noWrites.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('riz', 90)]]]))
    const checked = await noWrites.check.execute(bread.id, true)
    // Le remplissage ne supprime rien : une suppression en panne ne le gêne pas.
    const emptied = await noDeletes.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, []]]))

    expect(!filled.ok && filled.error.code).toBe('SHOPPING_LIST_NOT_SAVED')
    expect(!checked.ok && checked.error.code).toBe('SHOPPING_LIST_NOT_SAVED')
    expect(emptied.ok).toBe(true)
  })

  it('refuse de remplir avec un aliment sans nom', async () => {
    const result = await setup().fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('x', 10, undefined, '')]]]))

    expect(!result.ok && result.error.code).toBe('INVALID_SHOPPING_ITEM')
  })
})

describe('Aliment ajouté par la recherche', () => {
  const rice = { foodItemId: idFrom<'FoodItemId'>('riz'), name: 'Riz', grams: 100, unit: GRAM }

  it('crée sa ligne, puis la rejoint au lieu d’en créer une seconde', async () => {
    const shop = setup()

    unwrap(await shop.addFood.execute(HOUSEHOLD_LIST, rice))
    unwrap(await shop.fill.execute(HOUSEHOLD_LIST, demandOf([[CAMILLE, [line('riz', 80, GRAM, 'Riz')]]])))
    const view = unwrap(await shop.addFood.execute(HOUSEHOLD_LIST, rice))

    expect(view.grams).toBe(280)
    expect(unwrap(await shop.get.execute(HOUSEHOLD_LIST)).items.map((item) => [item.name, item.grams])).toEqual([
      ['Riz', 280],
    ])
  })

  it('refuse une quantité nulle ou un aliment sans nom', async () => {
    const shop = setup()

    const empty = await shop.addFood.execute(HOUSEHOLD_LIST, { ...rice, grams: 0 })
    const nameless = await shop.addFood.execute(HOUSEHOLD_LIST, { ...rice, name: ' ' })

    expect(!empty.ok && empty.error.code).toBe('INVALID_SHOPPING_ITEM')
    expect(!nameless.ok && nameless.error.code).toBe('INVALID_SHOPPING_ITEM')
  })

  it('signale un échec d’écriture', async () => {
    const memory = new InMemoryShoppingRepository()
    const result = await setup(failing(memory, 'saveAll')).addFood.execute(HOUSEHOLD_LIST, rice)

    expect(!result.ok && result.error.code).toBe('SHOPPING_LIST_NOT_SAVED')
  })
})
