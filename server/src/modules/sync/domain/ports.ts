import type { AccountId, PlayerId } from '@/core/identity'

import type { IncomingChange, IncomingUpsert, RecordKey, SyncEntity } from './SyncChange'

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
  /**
   * Crée un enregistrement au nom d'un autre compte. Création seulement : rien
   * n'est écrit si l'identifiant existe déjà, et la méthode renvoie alors `false`.
   */
  offer(owner: AccountId, change: IncomingUpsert): Promise<boolean>
  /**
   * Ce qui a changé depuis `since` : les enregistrements du compte, plus les
   * aliments créés par les comptes de `foodAuthors`.
   */
  changesSince(
    owner: AccountId,
    foodAuthors: readonly AccountId[],
    since: number,
    limit: number,
  ): Promise<ChangePage>
}

/**
 * Ce que la synchronisation doit savoir du foyer. Le module `sync` n'importe
 * pas `household` : il reçoit ce port à la composition.
 */
export interface IHouseholdDirectory {
  /** Les autres membres du foyer du compte ; vide sans foyer. */
  coMembers(account: AccountId): Promise<readonly AccountId[]>
  /** Compte du membre du même foyer rattaché à ce profil, ou `null`. */
  memberAccountOf(account: AccountId, playerId: PlayerId): Promise<AccountId | null>
}

export type { SyncEntity }
