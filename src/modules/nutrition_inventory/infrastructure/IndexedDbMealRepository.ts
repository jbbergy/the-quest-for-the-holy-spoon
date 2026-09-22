import { dayKeyOf } from '@/core/day'
import type { RepositoryError } from '@/core/errors'
import type { MealId, PlayerId } from '@/core/identity'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { INDEX, STORE } from '@/core/infrastructure/database'
import { getAllFromIndex, guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import type { Result } from '@/core/result'

import type { Meal } from '../domain/Meal'
import type { IMealRepository } from '../domain/repositories'

import { mealToRecord, type MealRecord, recordToMeal } from './records'

export class IndexedDbMealRepository implements IMealRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findById(id: MealId): Promise<Result<Meal | null, RepositoryError>> {
    return guard('lecture d’un repas', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meals, 'readonly')
      const record = await requestToPromise<MealRecord | undefined>(
        tx.objectStore(STORE.meals).get(id),
      )
      return record === undefined ? null : recordToMeal(record)
    })
  }

  /**
   * Repas d'une journée, triés chronologiquement.
   *
   * L'index composé `[playerId, dayKey]` fait le filtrage côté base : sans lui,
   * afficher le journal du jour imposerait de lire tout l'historique du joueur.
   */
  async findByPlayerAndDay(
    playerId: PlayerId,
    day: Date,
  ): Promise<Result<Meal[], RepositoryError>> {
    return guard('lecture du journal', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meals, 'readonly')
      const index = tx.objectStore(STORE.meals).index(INDEX.mealsByPlayerDay)

      const records = await getAllFromIndex<MealRecord>(
        index,
        IDBKeyRange.only([playerId, dayKeyOf(day)]),
      )

      return records
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
        .map(recordToMeal)
    })
  }

  /**
   * Tout l'historique d'un joueur.
   *
   * Aucun index dédié n'est nécessaire : l'index composé `[playerId, dayKey]`
   * est déjà ordonné par joueur, et une plage bornée par les deux extrêmes
   * possibles d'une clé de journée le parcourt entièrement pour ce seul joueur.
   * `\uffff` est le dernier point de code du plan multilingue de base : aucune
   * clé `AAAA-MM-JJ` ne lui est supérieure.
   */
  async findAllByPlayer(playerId: PlayerId): Promise<Result<Meal[], RepositoryError>> {
    return guard('lecture de l’historique', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meals, 'readonly')
      const index = tx.objectStore(STORE.meals).index(INDEX.mealsByPlayerDay)

      const records = await getAllFromIndex<MealRecord>(
        index,
        IDBKeyRange.bound([playerId, ''], [playerId, '\uffff']),
      )

      return records.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)).map(recordToMeal)
    })
  }

  async save(meal: Meal): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement d’un repas', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meals, 'readwrite')
      tx.objectStore(STORE.meals).put(mealToRecord(meal))
      await transactionToPromise(tx)
    })
  }

  async delete(id: MealId): Promise<Result<void, RepositoryError>> {
    return guard('suppression d’un repas', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meals, 'readwrite')
      tx.objectStore(STORE.meals).delete(id)
      await transactionToPromise(tx)
    })
  }
}
