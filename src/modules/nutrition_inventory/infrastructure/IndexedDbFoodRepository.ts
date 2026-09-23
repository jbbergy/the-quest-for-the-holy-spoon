import type { RepositoryError } from '@/core/errors'
import type { FoodItemId } from '@/core/identity'
import { JOURNAL_STORES, journal, localChanges } from '@/core/infrastructure/changeJournal'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { INDEX, STORE } from '@/core/infrastructure/database'
import {
  getAllFromIndex,
  guard,
  requestToPromise,
  transactionToPromise,
} from '@/core/infrastructure/idb'
import { tokenize } from '@/core/infrastructure/text'
import type { Result } from '@/core/result'

import { type FoodItem, FoodSource } from '../domain/FoodItem'
import type { IFoodRepository } from '../domain/repositories'

import { foodToRecord, type FoodRecord, recordToFood } from './records'

const DEFAULT_SEARCH_LIMIT = 25

/** Nombre d'enregistrements par transaction lors du seeding du catalogue. */
const WRITE_CHUNK_SIZE = 500

export class IndexedDbFoodRepository implements IFoodRepository {
  constructor(private readonly databases: DatabaseProvider) {}

  async findById(id: FoodItemId): Promise<Result<FoodItem | null, RepositoryError>> {
    return guard('lecture d’un aliment', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.foods, 'readonly')
      const record = await requestToPromise<FoodRecord | undefined>(
        tx.objectStore(STORE.foods).get(id),
      )
      return record === undefined ? null : recordToFood(record)
    })
  }

  async findByBarcode(barcode: string): Promise<Result<FoodItem | null, RepositoryError>> {
    return guard('recherche par code-barres', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.foods, 'readonly')
      const record = await requestToPromise<FoodRecord | undefined>(
        tx.objectStore(STORE.foods).index(INDEX.foodsByBarcode).get(barcode),
      )
      return record === undefined ? null : recordToFood(record)
    })
  }

  /**
   * Recherche par jetons : chaque mot de la requête doit correspondre au préfixe
   * d'au moins un jeton indexé. Les résultats sont ensuite classés par nombre de
   * jetons satisfaits puis par longueur de nom — un nom court qui couvre toute la
   * requête est presque toujours le bon (« poulet » doit sortir « Poulet, cru »
   * avant « Sauce au poulet et aux champignons »).
   */
  async searchByName(
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<Result<FoodItem[], RepositoryError>> {
    return guard('recherche par nom', async () => {
      const terms = tokenize(query)
      if (terms.length === 0) return []

      const db = await this.databases.get()
      const tx = db.transaction(STORE.foods, 'readonly')
      const index = tx.objectStore(STORE.foods).index(INDEX.foodsByToken)

      const hitsPerTerm = await Promise.all(
        terms.map((term) =>
          getAllFromIndex<FoodRecord>(index, prefixRange(term), MAX_HITS_PER_TERM),
        ),
      )

      const scores = new Map<string, { record: FoodRecord; matched: number }>()
      for (const hits of hitsPerTerm) {
        // Dédoublonnage par terme : un même aliment peut porter plusieurs jetons
        // correspondant au même préfixe (« poulet » et « poulets ») et ne doit
        // pas compter deux fois pour un seul mot de la requête.
        for (const record of dedupeById(hits)) {
          const existing = scores.get(record.id)
          if (existing === undefined) scores.set(record.id, { record, matched: 1 })
          else existing.matched += 1
        }
      }

      return [...scores.values()]
        .filter((entry) => entry.matched === terms.length)
        .sort(
          (a, b) => b.matched - a.matched || a.record.name.length - b.record.name.length,
        )
        .slice(0, limit)
        .map((entry) => recordToFood(entry.record))
    })
  }

  /**
   * Balayage complet du store, filtré en mémoire.
   *
   * Aucun index sur `source`, et c'est délibéré : en créer un imposerait une
   * migration de schéma pour une lecture qui ne survient qu'à la demande
   * explicite de l'utilisateur, lors d'un export. Le catalogue pèse quelques
   * milliers de fiches — le coût est celui d'un clic, pas celui d'une frappe au
   * clavier dans la recherche.
   */
  async findBySource(source: FoodSource): Promise<Result<FoodItem[], RepositoryError>> {
    return guard('lecture du catalogue par provenance', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.foods, 'readonly')
      const records = await requestToPromise<FoodRecord[]>(
        tx.objectStore(STORE.foods).getAll() as IDBRequest<FoodRecord[]>,
      )

      return records
        .filter((record) => record.source === source)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map(recordToFood)
    })
  }

  /**
   * Seuls les aliments créés à la main partent vers le serveur : une fiche
   * Ciqual ou Open Food Facts se retrouve à sa source, et un repas garde de
   * toute façon l'instantané de ses aliments.
   */
  async save(item: FoodItem): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement d’un aliment', async () => {
      const db = await this.databases.get()
      const tx = db.transaction([STORE.foods, ...JOURNAL_STORES], 'readwrite')
      tx.objectStore(STORE.foods).put(foodToRecord(item))
      const journaled =
        item.source === FoodSource.USER &&
        (await journal(tx, { entity: 'food', id: item.id, op: 'upsert' }, null))
      await transactionToPromise(tx)
      if (journaled) localChanges.notify()
    })
  }

  /**
   * Écriture en lots. Le catalogue Ciqual compte plusieurs milliers de fiches :
   * une transaction unique tiendrait la base verrouillée trop longtemps et
   * rendrait l'écran de démarrage inerte.
   */
  async saveMany(items: readonly FoodItem[]): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement du catalogue', async () => {
      const db = await this.databases.get()
      for (let start = 0; start < items.length; start += WRITE_CHUNK_SIZE) {
        const chunk = items.slice(start, start + WRITE_CHUNK_SIZE)
        const tx = db.transaction(STORE.foods, 'readwrite')
        const store = tx.objectStore(STORE.foods)
        for (const item of chunk) store.put(foodToRecord(item))
        await transactionToPromise(tx)
      }
    })
  }

  async count(): Promise<Result<number, RepositoryError>> {
    return guard('comptage du catalogue', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.foods, 'readonly')
      return requestToPromise(tx.objectStore(STORE.foods).count())
    })
  }
}

/** Au-delà, le terme est trop peu discriminant pour qu'un tri améliore le résultat. */
const MAX_HITS_PER_TERM = 400

/**
 * Plage de clés couvrant tous les jetons commençant par `prefix`.
 * `￿` est le dernier point de code du plan multilingue de base : il borne
 * la plage par le haut sans exclure de suffixe réel.
 */
function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}￿`)
}

function dedupeById(records: readonly FoodRecord[]): FoodRecord[] {
  const seen = new Map<string, FoodRecord>()
  for (const record of records) {
    if (!seen.has(record.id)) seen.set(record.id, record)
  }
  return [...seen.values()]
}
