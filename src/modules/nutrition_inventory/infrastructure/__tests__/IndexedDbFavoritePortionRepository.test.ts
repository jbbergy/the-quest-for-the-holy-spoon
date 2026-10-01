import { beforeEach, describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { writeSyncState } from '@/core/infrastructure/changeJournal'
import { type DatabaseProvider, STORE } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import { FavoritePortion } from '@/modules/nutrition_inventory/domain/FavoritePortion'
import { IndexedDbFavoritePortionRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFavoritePortionRepository'

let databases: DatabaseProvider
let repository: IndexedDbFavoritePortionRepository

const playerId: PlayerId = idFrom('player-1')

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const portionOf = (grams: number, player: PlayerId = playerId): FavoritePortion =>
  unwrap(FavoritePortion.create({ playerId: player, foodItemId: idFrom('ciqual:7200'), grams, measure: 'tranche' }))

async function outbox(): Promise<unknown[]> {
  const tx = (await databases.get()).transaction(STORE.outbox, 'readonly')
  return requestToPromise(tx.objectStore(STORE.outbox).getAll())
}

async function connect(): Promise<void> {
  const tx = (await databases.get()).transaction(STORE.meta, 'readwrite')
  writeSyncState(tx, { accountId: 'account-1', playerId, cursor: 0 })
  await transactionToPromise(tx)
}

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbFavoritePortionRepository(databases)
})

describe('IndexedDbFavoritePortionRepository', () => {
  it('restitue les portions du joueur, et seulement les siennes', async () => {
    const mine = portionOf(50)
    unwrap(await repository.save(mine))
    unwrap(await repository.save(portionOf(25, idFrom('player-2'))))

    expect(unwrap(await repository.findByPlayer(playerId))).toEqual([mine])
  })

  it('supprime, et ne s’en plaint pas quand la portion n’existe pas', async () => {
    const portion = portionOf(50)
    unwrap(await repository.save(portion))

    unwrap(await repository.delete(portion.id))
    unwrap(await repository.delete(portion.id))

    expect(unwrap(await repository.findByPlayer(playerId))).toEqual([])
  })

  describe('synchronisation', () => {
    it('ne journalise rien sans compte connecté', async () => {
      unwrap(await repository.save(portionOf(50)))

      expect(await outbox()).toEqual([])
    })

    it('journalise l’écriture et la suppression d’une portion du compte', async () => {
      await connect()
      const portion = portionOf(50)

      unwrap(await repository.save(portion))
      unwrap(await repository.delete(portion.id))

      expect(await outbox()).toMatchObject([
        { entity: 'portion', id: portion.id, op: 'upsert' },
        { entity: 'portion', id: portion.id, op: 'delete' },
      ])
    })

    it('ne journalise pas la portion d’un autre profil de l’appareil', async () => {
      await connect()

      unwrap(await repository.save(portionOf(50, idFrom('player-2'))))

      expect(await outbox()).toEqual([])
    })
  })
})
