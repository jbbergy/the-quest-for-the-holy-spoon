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
export type SyncEntity = 'player' | 'meal' | 'food' | 'shopping' | 'recipe' | 'portion'
export type SyncOp = 'upsert' | 'delete'

export interface OutboxEntry {
  readonly seq?: number
  readonly entity: SyncEntity
  readonly id: string
  readonly op: SyncOp
  /**
   * Contenu à envoyer tel quel, pour un enregistrement que l'appareil ne garde
   * pas : un repas prévu pour un autre membre du foyer. Absent, l'envoi relit
   * l'état courant de l'enregistrement.
   */
  readonly payload?: Readonly<Record<string, unknown>>
}

export interface SyncState {
  readonly accountId: string
  /** Le seul profil synchronisé : les autres profils de l'appareil restent locaux. */
  readonly playerId: string
  /** Révision serveur jusqu'à laquelle l'appareil est à jour. */
  readonly cursor: number
  /**
   * Empreinte du foyer (identifiant et membres) connue lors de la dernière
   * lecture complète. Quand elle change, les aliments des autres membres sont
   * relus depuis le début : ceux d'un nouveau venu datent d'avant le curseur.
   */
  readonly household?: string | null
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
 * `ownerPlayerId` : le profil auquel appartient l'enregistrement. Un repas ou
 * un aliment d'un autre profil local n'est pas journalisé : il n'appartient
 * pas au compte.
 */
export async function journal(
  tx: IDBTransaction,
  change: OutboxEntry,
  ownerPlayerId: string,
): Promise<boolean> {
  const state = await readSyncState(tx)
  if (state === null || ownerPlayerId !== state.playerId) return false

  tx.objectStore(STORE.outbox).add({ entity: change.entity, id: change.id, op: change.op })
  return true
}

/**
 * Journalise une modification d'un enregistrement **commun au foyer** : tout
 * membre connecté peut l'écrire, et c'est le serveur qui vérifie qu'il est
 * bien du foyer. Sans compte connecté, rien n'est journalisé.
 */
export async function journalShared(tx: IDBTransaction, change: OutboxEntry): Promise<boolean> {
  const state = await readSyncState(tx)
  if (state === null) return false

  tx.objectStore(STORE.outbox).add({ entity: change.entity, id: change.id, op: change.op })
  return true
}

/**
 * Dépose un enregistrement destiné à un autre compte, sans le garder sur
 * l'appareil : les données des autres membres n'y sont jamais stockées. Sans
 * compte connecté, rien n'est déposé — et la méthode le dit.
 */
export async function journalOffer(
  tx: IDBTransaction,
  entity: SyncEntity,
  payload: Readonly<Record<string, unknown>> & { readonly id: string },
): Promise<boolean> {
  const state = await readSyncState(tx)
  if (state === null) return false

  tx.objectStore(STORE.outbox).add({
    entity,
    id: payload.id,
    op: 'upsert',
    payload,
  } satisfies OutboxEntry)
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
