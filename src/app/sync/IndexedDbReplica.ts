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

import type { PlayerRecord } from '@/modules/player_profile/infrastructure/records'

import { householdIdOfKey } from './householdKey'
import type { ILocalReplica, PendingBatch } from './ports'
import { sharedNeedsOf } from './sharedNeeds'

/** Store IndexedDB de chaque entité synchronisée. */
const STORE_OF: Readonly<Record<SyncEntity, string>> = {
  player: STORE.players,
  meal: STORE.meals,
  food: STORE.foods,
  shopping: STORE.shopping,
  recipe: STORE.recipes,
  portion: STORE.favoritePortions,
}

const DATA_STORES = [
  STORE.players,
  STORE.meals,
  STORE.foods,
  STORE.shopping,
  STORE.recipes,
  STORE.favoritePortions,
] as const

interface StoredRecord {
  readonly id: string
  readonly playerId?: string
  readonly source?: string
  readonly ownerId?: string | null
  /** Article de courses : `null` pour une liste personnelle. */
  readonly householdId?: string | null
}

/** Aliment créé à la main par un profil qui n'est pas sur l'appareil : celui d'un autre membre. */
function isForeignFood(record: StoredRecord, localPlayers: ReadonlySet<string>): boolean {
  return record.source === 'USER' && record.ownerId != null && !localPlayers.has(record.ownerId)
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
        [...DATA_STORES, STORE.outbox],
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

      const recipes = await getAllFromIndex<StoredRecord>(
        tx.objectStore(STORE.recipes).index(INDEX.recipesByPlayer),
        IDBKeyRange.only(playerId),
      )
      for (const recipe of recipes) upsert('recipe', recipe.id)

      const portions = await getAllFromIndex<StoredRecord>(
        tx.objectStore(STORE.favoritePortions).index(INDEX.favoritePortionsByPlayer),
        IDBKeyRange.only(playerId),
      )
      for (const portion of portions) upsert('portion', portion.id)

      // Seuls les aliments dont ce profil est l'auteur : ceux des autres
      // membres du foyer, reçus par synchronisation, sont déjà sur le serveur.
      const foods = await requestToPromise(
        tx.objectStore(STORE.foods).getAll() as IDBRequest<StoredRecord[]>,
      )
      for (const food of foods) {
        if (food.source === 'USER' && food.ownerId === playerId) upsert('food', food.id)
      }

      // Sa liste de courses personnelle. Celle d'un foyer n'existe pas encore
      // sur un appareil qui se connecte : elle arrive par la lecture.
      const items = await requestToPromise(
        tx.objectStore(STORE.shopping).getAll() as IDBRequest<StoredRecord[]>,
      )
      for (const item of items) {
        if (item.householdId === null && item.playerId === playerId) upsert('shopping', item.id)
      }

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
            : (entry.payload ??
              (await requestToPromise<Record<string, unknown> | undefined>(
                tx.objectStore(STORE_OF[entry.entity]).get(entry.id),
              )))
        changes.push(
          record === undefined
            ? { op: 'delete', entity: entry.entity, id: entry.id }
            : { op: 'upsert', entity: entry.entity, id: entry.id, payload: record },
        )
        // Le profil part avec ses besoins : ce sont eux, et non lui, que les
        // autres membres du foyer pourront lire.
        if (entry.entity === 'player' && record !== undefined && entry.payload === undefined) {
          const needs = sharedNeedsOf(record as unknown as PlayerRecord)
          changes.push({ op: 'upsert', entity: 'needs', id: needs.id, payload: needs })
        }
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
        // Les besoins publiés se déduisent du profil : rien à stocker.
        if (change.entity === 'needs') continue
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

  rebase(household: string | null) {
    return guard('changement de foyer', async () => {
      const tx = (await this.databases.get()).transaction(
        [STORE.players, STORE.foods, STORE.shopping, STORE.outbox, STORE.meta],
        'readwrite',
      )
      const state = await readSyncState(tx)
      if (state === null || (state.household ?? null) === household) {
        tx.abort()
        return false
      }

      // On repart de zéro : les aliments des anciens membres disparaissent,
      // ceux des membres actuels reviendront à la lecture suivante — y compris
      // ceux d'un nouveau venu, créés avant le curseur.
      const locals = await requestToPromise(tx.objectStore(STORE.players).getAllKeys())
      await deleteFoods(tx, (food) => isForeignFood(food, new Set(locals.map(String))))
      await rebaseShopping(tx, householdIdOfKey(household))
      writeSyncState(tx, { ...state, cursor: 0, household })

      // Le profil repart aussi, pour que ses besoins soient publiés : les
      // nouveaux membres en ont besoin pour ajuster un repas prévu.
      //
      // Seulement s'il est déjà sur l'appareil. Juste après la connexion d'un
      // compte, le foyer peut arriver avant le profil en cours de
      // téléchargement : une entrée en attente ferait alors ignorer le profil
      // reçu (on ne réécrit pas ce qui attend d'être envoyé), puis partirait
      // comme une suppression — et le profil ne reviendrait jamais.
      if (locals.some((key) => String(key) === state.playerId)) {
        tx.objectStore(STORE.outbox).add({ entity: 'player', id: state.playerId, op: 'upsert' } satisfies OutboxEntry)
      }
      await transactionToPromise(tx)
      return true
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
      // La liste du foyer ne se lit qu'avec le compte : elle part avec lui.
      await deleteShopping(tx, (item) => item.householdId != null)

      if (options.wipe && state !== null) {
        const meals = tx.objectStore(STORE.meals)
        const mealKeys = await requestToPromise(
          meals
            .index(INDEX.mealsByPlayerDay)
            .getAllKeys(IDBKeyRange.bound([state.playerId, ''], [state.playerId, '￿'])),
        )
        for (const key of mealKeys) meals.delete(key)
        tx.objectStore(STORE.players).delete(state.playerId)

        const recipes = tx.objectStore(STORE.recipes)
        const recipeKeys = await requestToPromise(
          recipes.index(INDEX.recipesByPlayer).getAllKeys(IDBKeyRange.only(state.playerId)),
        )
        for (const key of recipeKeys) recipes.delete(key)

        const portions = tx.objectStore(STORE.favoritePortions)
        const portionKeys = await requestToPromise(
          portions.index(INDEX.favoritePortionsByPlayer).getAllKeys(IDBKeyRange.only(state.playerId)),
        )
        for (const key of portionKeys) portions.delete(key)

        // Le profil courant devient un autre profil resté sur l'appareil, s'il
        // en existe un ; sinon l'application revient à l'accueil.
        const others = await requestToPromise(tx.objectStore(STORE.players).getAllKeys())
        const remaining = new Set(others.map(String).filter((key) => key !== state.playerId))

        // Les aliments du compte et ceux des autres membres du foyer partent
        // aussi ; ceux des profils restés sur l'appareil demeurent.
        await deleteFoods(tx, (food) => isForeignFood(food, remaining))
        await deleteShopping(tx, (item) => item.playerId === state.playerId)

        const next = others.find((key) => key !== state.playerId)
        const meta = tx.objectStore(STORE.meta)
        if (next === undefined) meta.delete(META_KEY.currentPlayerId)
        else meta.put({ key: META_KEY.currentPlayerId, value: String(next) })
      }

      await transactionToPromise(tx)
    })
  }
}

/** Supprime les aliments qui satisfont le critère, dans la transaction donnée. */
async function deleteFoods(
  tx: IDBTransaction,
  matches: (record: StoredRecord) => boolean,
): Promise<number> {
  const foods = tx.objectStore(STORE.foods)
  const records = await requestToPromise(foods.getAll() as IDBRequest<StoredRecord[]>)
  const doomed = records.filter(matches)
  for (const record of doomed) foods.delete(record.id)
  return doomed.length
}

/** Supprime les articles de courses qui satisfont le critère, dans la transaction donnée. */
async function deleteShopping(
  tx: IDBTransaction,
  matches: (record: StoredRecord) => boolean,
): Promise<StoredRecord[]> {
  const shopping = tx.objectStore(STORE.shopping)
  const records = await requestToPromise(shopping.getAll() as IDBRequest<StoredRecord[]>)
  const doomed = records.filter(matches)
  for (const record of doomed) shopping.delete(record.id)
  return doomed
}

/**
 * La liste du foyer après un changement de foyer.
 *
 * Celle d'un ancien foyer disparaît, et ses envois en attente avec elle : le
 * serveur les refuserait. Celle du foyer actuel est relue depuis le début,
 * comme les aliments — sauf les articles modifiés ici et pas encore envoyés,
 * qui partiront au prochain envoi.
 */
async function rebaseShopping(tx: IDBTransaction, householdId: string | null): Promise<void> {
  const pending = tx.objectStore(STORE.outbox).index(INDEX.outboxByRecord)
  const outbox = tx.objectStore(STORE.outbox)
  const records = await requestToPromise(
    tx.objectStore(STORE.shopping).getAll() as IDBRequest<StoredRecord[]>,
  )
  for (const record of records) {
    if (record.householdId == null) continue
    const keys = await requestToPromise(pending.getAllKeys(['shopping', record.id]))
    if (record.householdId === householdId && keys.length > 0) continue
    tx.objectStore(STORE.shopping).delete(record.id)
    for (const key of keys) outbox.delete(key)
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
