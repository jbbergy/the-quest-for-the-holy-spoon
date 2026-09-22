import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { META_KEY, STORE } from '@/core/infrastructure/database'
import { guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import type { Result } from '@/core/result'

import type { Player } from '../domain/Player'
import type { IPlayerRepository } from '../domain/repositories'

import { playerToRecord, type PlayerRecord, recordToPlayer } from './records'

interface MetaRecord {
  readonly key: string
  readonly value: string
}

/**
 * Persistance locale du profil.
 *
 * L'application est mono-joueur aujourd'hui, mais le store est bien un store de
 * joueurs indexé par identifiant : le « joueur courant » n'est qu'un pointeur
 * dans `meta`. Passer à plusieurs profils, ou à un backend distant, ne demandera
 * pas de remodeler le stockage — seulement de changer d'adaptateur.
 */
export class IndexedDbPlayerRepository implements IPlayerRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findById(id: PlayerId): Promise<Result<Player | null, RepositoryError>> {
    return guard('lecture du profil', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.players, 'readonly')
      const record = await requestToPromise<PlayerRecord | undefined>(
        tx.objectStore(STORE.players).get(id),
      )
      return record === undefined ? null : recordToPlayer(record)
    })
  }

  async findCurrent(): Promise<Result<Player | null, RepositoryError>> {
    return guard('lecture du profil courant', async () => {
      const db = await this.databases.get()
      // Une seule transaction sur les deux stores : lire le pointeur puis le
      // profil dans deux transactions distinctes laisserait une fenêtre où le
      // profil pointé a déjà été supprimé.
      const tx = db.transaction([STORE.meta, STORE.players], 'readonly')

      const pointer = await requestToPromise<MetaRecord | undefined>(
        tx.objectStore(STORE.meta).get(META_KEY.currentPlayerId),
      )
      if (pointer === undefined) return null

      const record = await requestToPromise<PlayerRecord | undefined>(
        tx.objectStore(STORE.players).get(pointer.value),
      )
      return record === undefined ? null : recordToPlayer(record)
    })
  }

  /** Enregistre le profil et le désigne comme courant, atomiquement. */
  async save(player: Player): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement du profil', async () => {
      const db = await this.databases.get()
      const tx = db.transaction([STORE.players, STORE.meta], 'readwrite')
      tx.objectStore(STORE.players).put(playerToRecord(player))
      tx.objectStore(STORE.meta).put({
        key: META_KEY.currentPlayerId,
        value: player.id,
      } satisfies MetaRecord)
      await transactionToPromise(tx)
    })
  }

  async delete(id: PlayerId): Promise<Result<void, RepositoryError>> {
    return guard('suppression du profil', async () => {
      const db = await this.databases.get()
      const tx = db.transaction([STORE.players, STORE.meta], 'readwrite')
      tx.objectStore(STORE.players).delete(id)

      // Le pointeur ne doit pas survivre au profil qu'il désigne.
      const meta = tx.objectStore(STORE.meta)
      const pointer = await requestToPromise<MetaRecord | undefined>(
        meta.get(META_KEY.currentPlayerId),
      )
      if (pointer?.value === id) meta.delete(META_KEY.currentPlayerId)

      await transactionToPromise(tx)
    })
  }
}
