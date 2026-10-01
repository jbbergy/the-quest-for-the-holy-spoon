import { beforeEach, describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import {
  AddFavoritePortionUseCase,
  ListFavoritePortionsUseCase,
  RemoveFavoritePortionUseCase,
} from '@/modules/nutrition_inventory/application'
import { FavoritePortion } from '@/modules/nutrition_inventory/domain/FavoritePortion'
import { InMemoryFavoritePortionRepository } from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'

const playerId: PlayerId = idFrom('player-1')
const bread = idFrom<'FoodItemId'>('ciqual:7200')
const rice = idFrom<'FoodItemId'>('ciqual:39212')

let repository: InMemoryFavoritePortionRepository
let list: ListFavoritePortionsUseCase
let add: AddFavoritePortionUseCase
let remove: RemoveFavoritePortionUseCase

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

beforeEach(() => {
  repository = new InMemoryFavoritePortionRepository()
  list = new ListFavoritePortionsUseCase(repository)
  add = new AddFavoritePortionUseCase(repository)
  remove = new RemoveFavoritePortionUseCase(repository)
})

describe('portions favorites', () => {
  it('les range par aliment, de la plus petite à la plus grande', async () => {
    unwrap(await add.execute({ playerId, foodItemId: bread, grams: 75, measure: 'tranche' }))
    unwrap(await add.execute({ playerId, foodItemId: bread, grams: 25, measure: 'tranche' }))
    unwrap(await add.execute({ playerId, foodItemId: rice, grams: 150, measure: 'g' }))
    unwrap(await add.execute({ playerId: idFrom('player-2'), foodItemId: rice, grams: 80, measure: 'g' }))

    const found = unwrap(await list.execute(playerId))

    expect(found.get(bread)?.map((portion) => portion.grams)).toEqual([25, 75])
    expect(found.get(rice)).toMatchObject([{ grams: 150, measure: 'g' }])
  })

  it('ne garde pas deux fois la même portion', async () => {
    const first = unwrap(await add.execute({ playerId, foodItemId: bread, grams: 50, measure: 'tranche' }))
    const again = unwrap(await add.execute({ playerId, foodItemId: bread, grams: 50, measure: 'tranche' }))

    expect(again.id).toBe(first.id)
    expect(unwrap(await repository.findByPlayer(playerId))).toHaveLength(1)
  })

  it('ne propose qu’une fois la portion gardée sur deux appareils', async () => {
    for (const id of ['portion-a', 'portion-b']) {
      const portion = FavoritePortion.create({ playerId, foodItemId: bread, grams: 50, measure: 'tranche', id: idFrom(id) })
      unwrap(await repository.save(unwrap(portion)))
    }

    expect(unwrap(await list.execute(playerId)).get(bread)).toHaveLength(1)
  })

  it('refuse une sixième portion pour le même aliment', async () => {
    for (const grams of [25, 50, 75, 100, 125]) {
      unwrap(await add.execute({ playerId, foodItemId: bread, grams, measure: 'tranche' }))
    }

    const sixth = await add.execute({ playerId, foodItemId: bread, grams: 150, measure: 'tranche' })
    const otherFood = await add.execute({ playerId, foodItemId: rice, grams: 150, measure: 'g' })

    expect(sixth).toMatchObject({ ok: false, error: { code: 'FAVORITE_PORTIONS_FULL' } })
    expect(otherFood.ok).toBe(true)
  })

  it('refuse une quantité nulle', async () => {
    expect(await add.execute({ playerId, foodItemId: bread, grams: 0, measure: 'g' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FAVORITE_PORTION' },
    })
  })

  it('retire une portion par sa valeur, doublons compris', async () => {
    for (const id of ['portion-a', 'portion-b']) {
      const portion = FavoritePortion.create({ playerId, foodItemId: bread, grams: 50, measure: 'tranche', id: idFrom(id) })
      unwrap(await repository.save(unwrap(portion)))
    }
    unwrap(await add.execute({ playerId, foodItemId: bread, grams: 25, measure: 'tranche' }))

    unwrap(await remove.execute({ playerId, foodItemId: bread, grams: 50, measure: 'tranche' }))

    expect(unwrap(await list.execute(playerId)).get(bread)?.map((portion) => portion.grams)).toEqual([25])
  })
})
