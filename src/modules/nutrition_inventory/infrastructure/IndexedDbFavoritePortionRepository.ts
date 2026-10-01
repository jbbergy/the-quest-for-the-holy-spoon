import type { RepositoryError } from '@/core/errors'
import type { FavoritePortionId, PlayerId } from '@/core/identity'
import { JOURNAL_STORES, journal, localChanges } from '@/core/infrastructure/changeJournal'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { INDEX, STORE } from '@/core/infrastructure/database'
import { getAllFromIndex, guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import type { Result } from '@/core/result'

import type { FavoritePortion } from '../domain/FavoritePortion'
import type { IFavoritePortionRepository } from '../domain/repositories'

import {
  type FavoritePortionRecord,
  favoritePortionToRecord,
  recordToFavoritePortion,
} from './records'

export class IndexedDbFavoritePortionRepository implements IFavoritePortionRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findByPlayer(playerId: PlayerId): Promise<Result<FavoritePortion[], RepositoryError>> {
    return guard('lecture des portions favorites', async () => {
      const tx = (await this.databases.get()).transaction(STORE.favoritePortions, 'readonly')
      const records = await getAllFromIndex<FavoritePortionRecord>(
        tx.objectStore(STORE.favoritePortions).index(INDEX.favoritePortionsByPlayer),
        IDBKeyRange.only(playerId),
      )
      return records.map(recordToFavoritePortion)
    })
  }

  /** Écriture et trace de synchronisation dans la même transaction (voir `changeJournal`). */
  async save(portion: FavoritePortion): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement d’une portion favorite', async () => {
      const tx = (await this.databases.get()).transaction(
        [STORE.favoritePortions, ...JOURNAL_STORES],
        'readwrite',
      )
      tx.objectStore(STORE.favoritePortions).put(favoritePortionToRecord(portion))
      const journaled = await journal(
        tx,
        { entity: 'portion', id: portion.id, op: 'upsert' },
        portion.playerId,
      )
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }

  async delete(id: FavoritePortionId): Promise<Result<void, RepositoryError>> {
    return guard('suppression d’une portion favorite', async () => {
      const tx = (await this.databases.get()).transaction(
        [STORE.favoritePortions, ...JOURNAL_STORES],
        'readwrite',
      )
      const portions = tx.objectStore(STORE.favoritePortions)
      // Le propriétaire se lit avant l'effacement : c'est lui qui dit si la
      // suppression doit partir vers le serveur.
      const record = await requestToPromise<FavoritePortionRecord | undefined>(portions.get(id))
      portions.delete(id)
      const journaled =
        record !== undefined &&
        (await journal(tx, { entity: 'portion', id, op: 'delete' }, record.playerId))
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }
}
