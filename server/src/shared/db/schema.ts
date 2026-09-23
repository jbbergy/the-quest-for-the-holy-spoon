import type { ColumnType, Generated, Insertable, Selectable } from 'kysely'

import type { EmailTokenPurpose } from '../../modules/account/domain/policies'

/**
 * Schéma de la base serveur, vu par Kysely.
 *
 * Ces types décrivent les **tables**, pas le domaine : le serveur traduit une
 * ligne en objet métier à la frontière, exactement comme le client le fait avec
 * ses enregistrements IndexedDB.
 */
export interface Database {
  accounts: AccountsTable
  sessions: SessionsTable
  email_tokens: EmailTokensTable
  records: RecordsTable
}

type CreatedAt = ColumnType<Date, Date | undefined, never>

export interface AccountsTable {
  id: string
  /** Normalisée par le VO `Email` : minuscules, sans espaces. */
  email: string
  password_hash: string
  email_verified_at: Date | null
  /** Profil nutritionnel rattaché au compte — un seul, jamais partagé. */
  player_id: string | null
  created_at: CreatedAt
}

export interface SessionsTable {
  /** SHA-256 du jeton : une fuite de la base ne donne accès à aucune session. */
  token_hash: string
  account_id: string
  created_at: CreatedAt
  expires_at: Date
}

export interface EmailTokensTable {
  token_hash: string
  account_id: string
  purpose: EmailTokenPurpose
  expires_at: Date
  used_at: Date | null
  created_at: CreatedAt
  id: Generated<number>
}

export type AccountRow = Selectable<AccountsTable>
export type NewAccountRow = Insertable<AccountsTable>

export interface RecordsTable {
  entity: 'player' | 'meal' | 'food'
  id: string
  owner_account_id: string
  payload: ColumnType<Record<string, unknown> | null, string | null, string | null>
  deleted: boolean
  /** `bigint` : le pilote le rend en chaîne, convertie à la lecture. */
  revision: ColumnType<string, never, never>
  updated_at: ColumnType<Date, Date | undefined, Date>
}
