import { beforeEach, describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { readSyncState, writeSyncState } from '@/core/infrastructure/changeJournal'
import { type DatabaseProvider, STORE } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import { Quantity } from '@/core/nutrition/Quantity'
import { GRAM } from '@/modules/nutrition_inventory/domain/Measure'
import { Recipe } from '@/modules/nutrition_inventory/domain/Recipe'
import { IndexedDbRecipeRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbRecipeRepository'
import { recipeToRecord, recordToRecipe } from '@/modules/nutrition_inventory/infrastructure/records'

let databases: DatabaseProvider
let repository: IndexedDbRecipeRepository

const playerId: PlayerId = idFrom('player-1')
const serving = { label: 'tranche', grams: 30, countable: true, approximate: true }

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const recipeOf = (name: string, player: PlayerId = playerId): Recipe =>
  unwrap(
    Recipe.create({
      playerId: player,
      name,
      lines: [
        { foodItemId: idFrom('ciqual:1'), foodName: 'Riz', quantity: Quantity.reconstitute(150), measure: GRAM },
        {
          foodItemId: idFrom('ciqual:2'),
          foodName: 'Pain',
          quantity: Quantity.reconstitute(60),
          measure: serving,
        },
      ],
    }),
  )

async function outbox(): Promise<unknown[]> {
  const tx = (await databases.get()).transaction(STORE.outbox, 'readonly')
  return requestToPromise(tx.objectStore(STORE.outbox).getAll())
}

async function connect(): Promise<void> {
  const tx = (await databases.get()).transaction(STORE.meta, 'readwrite')
  writeSyncState(tx, { accountId: 'account-1', playerId, cursor: 0 })
  await transactionToPromise(tx)
  expect(await readSyncState((await databases.get()).transaction(STORE.meta, 'readonly'))).not.toBeNull()
}

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbRecipeRepository(databases)
})

describe('IndexedDbRecipeRepository', () => {
  it('restitue une recette complète, mesures comprises', async () => {
    const recipe = recipeOf('Poke bowl')
    unwrap(await repository.save(recipe))

    const found = unwrap(await repository.findById(recipe.id))

    expect(found).toEqual(recipe)
  })

  it('écrit le gramme implicitement et garde les autres mesures', () => {
    const record = recipeToRecord(recipeOf('Poke bowl'))

    expect(record.lines[0]).not.toHaveProperty('measure')
    expect(record.lines[1]!.measure).toEqual(serving)
    expect(recordToRecipe(record).lines[0]!.measure).toEqual(GRAM)
  })

  it('ne rend que les recettes du joueur, triées par nom', async () => {
    unwrap(await repository.save(recipeOf('Wrap')))
    unwrap(await repository.save(recipeOf('Curry')))
    unwrap(await repository.save(recipeOf('Salade de l’autre', idFrom('player-2'))))

    const found = unwrap(await repository.findByPlayer(playerId))

    expect(found.map((recipe) => recipe.name)).toEqual(['Curry', 'Wrap'])
  })

  it('supprime, et ne s’en plaint pas quand la recette n’existe pas', async () => {
    const recipe = recipeOf('Poke bowl')
    unwrap(await repository.save(recipe))

    unwrap(await repository.delete(recipe.id))
    unwrap(await repository.delete(recipe.id))

    expect(unwrap(await repository.findById(recipe.id))).toBeNull()
  })

  describe('synchronisation', () => {
    it('ne journalise rien sans compte connecté', async () => {
      unwrap(await repository.save(recipeOf('Poke bowl')))

      expect(await outbox()).toEqual([])
    })

    it('journalise l’écriture et la suppression d’une recette du compte', async () => {
      await connect()
      const recipe = recipeOf('Poke bowl')

      unwrap(await repository.save(recipe))
      unwrap(await repository.delete(recipe.id))

      expect(await outbox()).toMatchObject([
        { entity: 'recipe', id: recipe.id, op: 'upsert' },
        { entity: 'recipe', id: recipe.id, op: 'delete' },
      ])
    })

    it('ne journalise pas la recette d’un autre profil de l’appareil', async () => {
      await connect()

      unwrap(await repository.save(recipeOf('Salade', idFrom('player-2'))))

      expect(await outbox()).toEqual([])
    })
  })
})
