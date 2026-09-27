import { RepositoryError } from '@/core/errors'
import { JOURNAL_STORES, journalOffer, localChanges } from '@/core/infrastructure/changeJournal'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { guard, transactionToPromise } from '@/core/infrastructure/idb'
import { err, ok, type Result } from '@/core/result'

import type { Meal } from '../domain/Meal'
import type { IMealOffers } from '../domain/repositories'

import { mealToRecord } from './records'

export class NotSyncedError extends RepositoryError {
  constructor() {
    super('NOT_SYNCED', 'Aucun compte connecté : le repas ne peut pas être envoyé.')
  }
}

/**
 * Remet un repas destiné à un autre membre au journal de synchronisation, au
 * format d'enregistrement habituel, sans l'écrire dans le store des repas.
 */
export class OutboxMealOffers implements IMealOffers {
  constructor(private readonly databases: DatabaseProvider) {}

  async offer(meal: Meal): Promise<Result<void, RepositoryError>> {
    const written = await guard('envoi d’un repas au foyer', async () => {
      const tx = (await this.databases.get()).transaction([...JOURNAL_STORES], 'readwrite')
      const queued = await journalOffer(tx, 'meal', { ...mealToRecord(meal) })
      await transactionToPromise(tx)
      return queued
    })
    if (!written.ok) return written
    if (!written.value) return err(new NotSyncedError())

    localChanges.notify()
    return ok(undefined)
  }
}
