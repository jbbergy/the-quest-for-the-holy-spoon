import type { OutgoingChange, RemoteChange } from '@/contract/sync'
import {
  type OutboxEntry,
  readSyncState,
  type SyncEntity,
  type SyncState,
  writeSyncState,
} from '@/core/infrastructure/changeJournal'
import { type DatabaseProvider, INDEX, META_KEY, STORE } from '@/core/infrastructure/database'
import {
  getAllFromIndex,
  guard,
  requestToPromise,
  transactionToPromise,
} from '@/core/infrastructure/idb'

import type { ILocalReplica, PendingBatch } from './ports'

/** Store IndexedDB de chaque entité synchronisée. */
const STORE_OF: Readonly<Record<SyncEntity, string>> = {
  player: STORE.players,
  meal: STORE.meals,
  food: STORE.foods,
}

const DATA_STORES = [STORE.players, STORE.meals, STORE.foods] as const

interface StoredRecord {
  readonly id: string
  readonly playerId?: string
  readonly source?: string
}

/**
 * Réplique locale : le côté IndexedDB de la synchronisation.
 *
 * Elle échange des enregistrements **tels que stockés** — ceux des mappers
 * `records.ts` de chaque module. Le serveur les conserve à l'identique : un
 * seul format de sérialisation, déjà couvert par les migrations locales.
 */
export class IndexedDbReplica implements ILocalReplica {
  constructor(private readonly databases: DatabaseProvider) {}

  state() {
    return guard('lecture de l’état de synchronisation', async () => {
      const tx = (await this.databases.get()).transaction(STORE.meta, 'readonly')
      return readSyncState(tx)
    })
  }

  start(state: SyncState) {
    return guard('ouverture de la synchronisation', async () => {
      const tx = (await this.databases.get()).transaction([STORE.meta, STORE.outbox], 'readwrite')
      tx.objectStore(STORE.outbox).clear()
      writeSyncState(tx, state)
      await transactionToPromise(tx)
    })
  }

  enqueueAll(playerId: string) {
    return guard('préparation du premier envoi', async () => {
      const tx = (await this.databases.get()).transaction(
        [STORE.players, STORE.meals, STORE.foods, STORE.outbox],
        'readwrite',
      )
      const outbox = tx.objectStore(STORE.outbox)
      const upsert = (entity: SyncEntity, id: string): void => {
        outbox.add({ entity, id, op: 'upsert' } satisfies OutboxEntry)
      }

      const player = await requestToPromise<StoredRecord | undefined>(
        tx.objectStore(STORE.players).get(playerId),
      )
      if (player !== undefined) upsert('player', player.id)

      const meals = await getAllFromIndex<StoredRecord>(
        tx.objectStore(STORE.meals).index(INDEX.mealsByPlayerDay),
        IDBKeyRange.bound([playerId, ''], [playerId, '￿']),
      )
      for (const meal of meals) upsert('meal', meal.id)

      // Les aliments créés à la main sont communs aux profils de l'appareil.
      const foods = await requestToPromise(
        tx.objectStore(STORE.foods).getAll() as IDBRequest<StoredRecord[]>,
      )
      for (const food of foods) if (food.source === 'USER') upsert('food', food.id)

      await transactionToPromise(tx)
    })
  }

  pending(limit: number) {
    return guard('lecture du journal', async (): Promise<PendingBatch | null> => {
      const tx = (await this.databases.get()).transaction(
        [STORE.outbox, ...DATA_STORES],
        'readonly',
      )
      const entries = await requestToPromise(
        tx.objectStore(STORE.outbox).getAll(null, limit) as IDBRequest<Required<OutboxEntry>[]>,
      )
      if (entries.length === 0) return null

      // Plusieurs écritures d'un même enregistrement ne font qu'un envoi : sa
      // version actuelle, ou sa suppression.
      const latest = new Map<string, OutboxEntry>()
      for (const entry of entries) latest.set(`${entry.entity}:${entry.id}`, entry)

      const changes: OutgoingChange[] = []
      for (const entry of latest.values()) {
        const record =
          entry.op === 'delete'
            ? undefined
            : await requestToPromise<Record<string, unknown> | undefined>(
                tx.objectStore(STORE_OF[entry.entity]).get(entry.id),
              )
        changes.push(
          record === undefined
            ? { op: 'delete', entity: entry.entity, id: entry.id }
            : { op: 'upsert', entity: entry.entity, id: entry.id, payload: record },
        )
      }

      return { changes, lastSeq: entries.at(-1)!.seq }
    })
  }

  pendingCount() {
    return guard('comptage du journal', async () => {
      const tx = (await this.databases.get()).transaction(STORE.outbox, 'readonly')
      return requestToPromise(tx.objectStore(STORE.outbox).count())
    })
  }

  acknowledge(lastSeq: number) {
    return guard('purge du journal', async () => {
      const tx = (await this.databases.get()).transaction(STORE.outbox, 'readwrite')
      tx.objectStore(STORE.outbox).delete(IDBKeyRange.upperBound(lastSeq))
      await transactionToPromise(tx)
    })
  }

  applyRemote(changes: readonly RemoteChange[], cursor: number) {
    return guard('application des modifications distantes', async () => {
      const tx = (await this.databases.get()).transaction(
        [...DATA_STORES, STORE.outbox, STORE.meta],
        'readwrite',
      )
      const state = await readSyncState(tx)
      if (state === null) {
        tx.abort()
        return new Set<SyncEntity>()
      }

      const pendingIndex = tx.objectStore(STORE.outbox).index(INDEX.outboxByRecord)
      const changed = new Set<SyncEntity>()

      for (const change of changes) {
        const pending = await requestToPromise(pendingIndex.count([change.entity, change.id]))
        if (pending > 0) continue

        const store = tx.objectStore(STORE_OF[change.entity])
        const current = await requestToPromise<Record<string, unknown> | undefined>(
          store.get(change.id),
        )

        if (change.deleted) {
          if (current === undefined) continue
          store.delete(change.id)
        } else {
          // Le retour de ses propres envois est la règle, pas l'exception : il
          // ne réécrit rien et ne déclenche aucun rafraîchissement.
          if (current !== undefined && sameRecord(current, change.payload)) continue
          store.put(change.payload)
        }
        changed.add(change.entity)
      }

      writeSyncState(tx, { ...state, cursor })
      await transactionToPromise(tx)
      return changed as ReadonlySet<SyncEntity>
    })
  }

  makeCurrent(playerId: string) {
    return guard('changement de profil courant', async () => {
      const tx = (await this.databases.get()).transaction(STORE.meta, 'readwrite')
      tx.objectStore(STORE.meta).put({ key: META_KEY.currentPlayerId, value: playerId })
      await transactionToPromise(tx)
    })
  }

  stop(options: { readonly wipe: boolean }) {
    return guard('arrêt de la synchronisation', async () => {
      const tx = (await this.databases.get()).transaction(
        [...DATA_STORES, STORE.outbox, STORE.meta],
        'readwrite',
      )
      const state = await readSyncState(tx)
      tx.objectStore(STORE.outbox).clear()
      writeSyncState(tx, null)

      if (options.wipe && state !== null) {
        const meals = tx.objectStore(STORE.meals)
        const mealKeys = await requestToPromise(
          meals
            .index(INDEX.mealsByPlayerDay)
            .getAllKeys(IDBKeyRange.bound([state.playerId, ''], [state.playerId, '￿'])),
        )
        for (const key of mealKeys) meals.delete(key)
        tx.objectStore(STORE.players).delete(state.playerId)

        // Le profil courant devient un autre profil resté sur l'appareil, s'il
        // en existe un ; sinon l'application revient à l'accueil.
        const others = await requestToPromise(tx.objectStore(STORE.players).getAllKeys())
        const next = others.find((key) => key !== state.playerId)
        const meta = tx.objectStore(STORE.meta)
        if (next === undefined) meta.delete(META_KEY.currentPlayerId)
        else meta.put({ key: META_KEY.currentPlayerId, value: String(next) })
      }

      await transactionToPromise(tx)
    })
  }
}

/** Égalité structurelle de deux enregistrements sérialisables. */
function sameRecord(a: Record<string, unknown>, b: Readonly<Record<string, unknown>>): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => [key, sortKeys(inner)]),
  )
}
