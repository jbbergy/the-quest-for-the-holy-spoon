import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { STORE } from '@/core/infrastructure/database'
import { guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import { idFrom } from '@/core/identity'
import type { Result } from '@/core/result'

import { PlayerProgress } from '../domain/PlayerProgress'
import type { IPlayerProgressRepository } from '../domain/repositories'

/**
 * L'enregistrement ne stocke **que** le total d'XP.
 *
 * Le niveau et les paliers sont dérivés à la réhydratation : les persister
 * ouvrirait la porte à un état incohérent (un niveau 7 enregistré avec une XP de
 * niveau 3) impossible à réconcilier après coup.
 */
interface ProgressRecord {
  readonly playerId: string
  readonly totalXp: number
}

export class IndexedDbPlayerProgressRepository implements IPlayerProgressRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findByPlayer(
    playerId: PlayerId,
  ): Promise<Result<PlayerProgress | null, RepositoryError>> {
    return guard('lecture de la progression', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.progress, 'readonly')
      const record = await requestToPromise<ProgressRecord | undefined>(
        tx.objectStore(STORE.progress).get(playerId),
      )
      if (record === undefined) return null

      return PlayerProgress.reconstitute({
        playerId: idFrom(record.playerId),
        totalXp: record.totalXp,
      })
    })
  }

  async save(progress: PlayerProgress): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement de la progression', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.progress, 'readwrite')
      tx.objectStore(STORE.progress).put(progress.toJSON() satisfies ProgressRecord)
      await transactionToPromise(tx)
    })
  }
}
