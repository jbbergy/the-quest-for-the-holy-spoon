import type { AccountId } from '@/core/identity'

import type { IncomingChange, RecordKey, SyncEntity } from './SyncChange'

export type StoredChange =
  | (RecordKey & {
      readonly deleted: false
      readonly payload: Readonly<Record<string, unknown>>
      readonly revision: number
    })
  | (RecordKey & { readonly deleted: true; readonly revision: number })

export interface ChangePage {
  readonly changes: readonly StoredChange[]
  readonly hasMore: boolean
}

/**
 * Stockage des enregistrements synchronisés.
 *
 * Chaque écriture reçoit une **révision** croissante ; un appareil lit ce qui
 * a changé depuis la dernière révision qu'il a vue. La dernière écriture reçue
 * l'emporte — les données d'un compte n'ont qu'un auteur, et les conflits se
 * limitent à un même repas modifié sur deux appareils hors ligne.
 */
export interface IRecordStore {
  /**
   * Applique les modifications d'un compte, dans l'ordre et d'un bloc. Renvoie
   * celles qui visent un enregistrement appartenant à un autre compte.
   */
  apply(owner: AccountId, changes: readonly IncomingChange[]): Promise<readonly RecordKey[]>
  changesSince(owner: AccountId, since: number, limit: number): Promise<ChangePage>
}

export type { SyncEntity }
