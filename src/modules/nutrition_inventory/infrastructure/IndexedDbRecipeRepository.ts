import type { RepositoryError } from '@/core/errors'
import type { PlayerId, RecipeId } from '@/core/identity'
import { JOURNAL_STORES, journal, localChanges } from '@/core/infrastructure/changeJournal'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { INDEX, STORE } from '@/core/infrastructure/database'
import { getAllFromIndex, guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import type { Result } from '@/core/result'

import type { Recipe } from '../domain/Recipe'
import type { IRecipeRepository } from '../domain/repositories'

import { recipeToRecord, type RecipeRecord, recordToRecipe } from './records'

export class IndexedDbRecipeRepository implements IRecipeRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findById(id: RecipeId): Promise<Result<Recipe | null, RepositoryError>> {
    return guard('lecture d’une recette', async () => {
      const tx = (await this.databases.get()).transaction(STORE.recipes, 'readonly')
      const record = await requestToPromise<RecipeRecord | undefined>(
        tx.objectStore(STORE.recipes).get(id),
      )
      return record === undefined ? null : recordToRecipe(record)
    })
  }

  async findByPlayer(playerId: PlayerId): Promise<Result<Recipe[], RepositoryError>> {
    return guard('lecture des recettes', async () => {
      const tx = (await this.databases.get()).transaction(STORE.recipes, 'readonly')
      const records = await getAllFromIndex<RecipeRecord>(
        tx.objectStore(STORE.recipes).index(INDEX.recipesByPlayer),
        IDBKeyRange.only(playerId),
      )
      return records
        .map(recordToRecipe)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    })
  }

  /** Écriture et trace de synchronisation dans la même transaction (voir `changeJournal`). */
  async save(recipe: Recipe): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement d’une recette', async () => {
      const tx = (await this.databases.get()).transaction([STORE.recipes, ...JOURNAL_STORES], 'readwrite')
      tx.objectStore(STORE.recipes).put(recipeToRecord(recipe))
      const journaled = await journal(
        tx,
        { entity: 'recipe', id: recipe.id, op: 'upsert' },
        recipe.playerId,
      )
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }

  async delete(id: RecipeId): Promise<Result<void, RepositoryError>> {
    return guard('suppression d’une recette', async () => {
      const tx = (await this.databases.get()).transaction([STORE.recipes, ...JOURNAL_STORES], 'readwrite')
      const recipes = tx.objectStore(STORE.recipes)
      // Le propriétaire se lit avant l'effacement : c'est lui qui dit si la
      // suppression doit partir vers le serveur.
      const record = await requestToPromise<RecipeRecord | undefined>(recipes.get(id))
      recipes.delete(id)
      const journaled =
        record !== undefined &&
        (await journal(tx, { entity: 'recipe', id, op: 'delete' }, record.playerId))
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }
}
