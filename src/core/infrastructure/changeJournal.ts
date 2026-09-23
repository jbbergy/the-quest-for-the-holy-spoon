import { META_KEY, STORE } from './database'
import { requestToPromise } from './idb'

/**
 * Journal des modifications locales, pour la synchronisation différée.
 *
 * Chaque écriture d'un enregistrement synchronisé dépose, **dans la même
 * transaction**, une ligne « à envoyer » dans le store `outbox`. Si l'onglet se
 * ferme juste après, l'écriture et sa trace existent toutes deux ou aucune :
 * rien ne peut être modifié sans être un jour envoyé.
 *
 * Le journal ne porte que l'identité de l'enregistrement, pas son contenu :
 * l'envoi relit l'état courant. Trois modifications d'un même repas hors ligne
 * partent donc en un seul envoi, de la dernière version.
 *
 * Tant qu'aucun compte n'est connecté (`sync_state` absent), rien n'est
 * journalisé : l'usage sans compte ne laisse aucune trace.
 */
export type SyncEntity = 'player' | 'meal' | 'food'
export type SyncOp = 'upsert' | 'delete'

export interface OutboxEntry {
  readonly seq?: number
  readonly entity: SyncEntity
  readonly id: string
  readonly op: SyncOp
}

export interface SyncState {
  readonly accountId: string
  /** Le seul profil synchronisé : les autres profils de l'appareil restent locaux. */
  readonly playerId: string
  /** Révision serveur jusqu'à laquelle l'appareil est à jour. */
  readonly cursor: number
}

interface SyncStateRecord {
  readonly key: typeof META_KEY.syncState
  readonly value: SyncState
}

/** Stores à inclure dans toute transaction d'écriture qui journalise. */
export const JOURNAL_STORES = [STORE.meta, STORE.outbox] as const

export async function readSyncState(tx: IDBTransaction): Promise<SyncState | null> {
  const record = await requestToPromise<SyncStateRecord | undefined>(
    tx.objectStore(STORE.meta).get(META_KEY.syncState),
  )
  return record?.value ?? null
}

export function writeSyncState(tx: IDBTransaction, state: SyncState | null): void {
  const meta = tx.objectStore(STORE.meta)
  if (state === null) meta.delete(META_KEY.syncState)
  else meta.put({ key: META_KEY.syncState, value: state } satisfies SyncStateRecord)
}

/**
 * Journalise une modification si elle concerne le compte connecté.
 *
 * `ownerPlayerId` : le profil auquel appartient l'enregistrement, ou `null`
 * pour un aliment créé à la main (partagé par tous les profils de l'appareil).
 * Un repas d'un autre profil local n'est pas journalisé : il n'appartient pas
 * au compte.
 */
export async function journal(
  tx: IDBTransaction,
  change: OutboxEntry,
  ownerPlayerId: string | null,
): Promise<boolean> {
  const state = await readSyncState(tx)
  if (state === null) return false
  if (ownerPlayerId !== null && ownerPlayerId !== state.playerId) return false

  tx.objectStore(STORE.outbox).add({ entity: change.entity, id: change.id, op: change.op })
  return true
}

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Signal « une modification attend d'être envoyée ». Émis après la validation
 * de la transaction, jamais avant : le moteur de synchronisation ne doit pas
 * lire un journal qui pourrait encore être annulé.
 */
export const localChanges = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  notify(): void {
    for (const listener of listeners) listener()
  },
}
