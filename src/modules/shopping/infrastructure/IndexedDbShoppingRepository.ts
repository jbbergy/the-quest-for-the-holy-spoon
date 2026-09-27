import type { RepositoryError } from '@/core/errors'
import type { ShoppingItemId } from '@/core/identity'
import {
  JOURNAL_STORES,
  journal,
  journalShared,
  localChanges,
  type OutboxEntry,
} from '@/core/infrastructure/changeJournal'
import { type DatabaseProvider, INDEX, STORE } from '@/core/infrastructure/database'
import { getAllFromIndex, guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import type { Result } from '@/core/result'

import type { IShoppingItemRepository } from '../domain/repositories'
import { listKey, type ShoppingItem, type ShoppingListRef } from '../domain/ShoppingItem'

import { recordToShoppingItem, type ShoppingItemRecord, shoppingItemToRecord } from './records'

/**
 * Journalise l'écriture d'un article : celui d'un foyer part dès qu'un compte
 * est connecté, celui d'une liste personnelle seulement s'il est au profil du
 * compte.
 */
function journalItem(
  tx: IDBTransaction,
  record: Pick<ShoppingItemRecord, 'id' | 'householdId' | 'playerId'>,
  op: OutboxEntry['op'],
): Promise<boolean> {
  const change = { entity: 'shopping', id: record.id, op } as const
  return record.householdId === null ? journal(tx, change, record.playerId) : journalShared(tx, change)
}

export class IndexedDbShoppingRepository implements IShoppingItemRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  findByList(list: ShoppingListRef): Promise<Result<ShoppingItem[], RepositoryError>> {
    return guard('lecture de la liste de courses', async () => {
      const tx = (await this.databases.get()).transaction(STORE.shopping, 'readonly')
      const records = await getAllFromIndex<ShoppingItemRecord>(
        tx.objectStore(STORE.shopping).index(INDEX.shoppingByList),
        IDBKeyRange.only([listKey(list), list.week]),
      )
      return records.map(recordToShoppingItem)
    })
  }

  findById(id: ShoppingItemId): Promise<Result<ShoppingItem | null, RepositoryError>> {
    return guard('lecture d’un article', async () => {
      const tx = (await this.databases.get()).transaction(STORE.shopping, 'readonly')
      const record = await requestToPromise<ShoppingItemRecord | undefined>(
        tx.objectStore(STORE.shopping).get(id),
      )
      return record === undefined ? null : recordToShoppingItem(record)
    })
  }

  saveAll(items: readonly ShoppingItem[]): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement de la liste de courses', async () => {
      if (items.length === 0) return
      const tx = (await this.databases.get()).transaction(
        [STORE.shopping, ...JOURNAL_STORES],
        'readwrite',
      )
      let journaled = false
      for (const item of items) {
        const record = shoppingItemToRecord(item)
        tx.objectStore(STORE.shopping).put(record)
        journaled = (await journalItem(tx, record, 'upsert')) || journaled
      }
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }

  deleteAll(ids: readonly ShoppingItemId[]): Promise<Result<void, RepositoryError>> {
    return guard('suppression d’articles', async () => {
      if (ids.length === 0) return
      const tx = (await this.databases.get()).transaction(
        [STORE.shopping, ...JOURNAL_STORES],
        'readwrite',
      )
      const store = tx.objectStore(STORE.shopping)
      let journaled = false
      for (const id of ids) {
        const record = await requestToPromise<ShoppingItemRecord | undefined>(store.get(id))
        if (record === undefined) continue
        store.delete(id)
        journaled = (await journalItem(tx, record, 'delete')) || journaled
      }
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }
}
