import { type AccountId, idFrom, type PlayerId } from '@/core/identity'

import type { Db } from '../../../shared/db/database'
import type { IHouseholdDirectory } from '../domain/ports'

/**
 * Lecture seule des tables du foyer, pour les besoins de la synchronisation.
 *
 * Le module `sync` ne dépend pas du module `household` : il lit directement
 * l'appartenance, qui est la seule chose qu'il lui faut, et ne l'écrit jamais.
 */
export class KyselyHouseholdDirectory implements IHouseholdDirectory {
  constructor(private readonly db: Db) {}

  async coMembers(account: AccountId): Promise<readonly AccountId[]> {
    const rows = await this.db
      .selectFrom('household_members as mine')
      .innerJoin('household_members as other', 'other.household_id', 'mine.household_id')
      .select('other.account_id')
      .where('mine.account_id', '=', account)
      .where('other.account_id', '!=', account)
      .execute()
    return rows.map((row) => idFrom<'AccountId'>(row.account_id))
  }

  async memberAccountOf(account: AccountId, playerId: PlayerId): Promise<AccountId | null> {
    const row = await this.db
      .selectFrom('household_members as mine')
      .innerJoin('household_members as other', 'other.household_id', 'mine.household_id')
      .innerJoin('accounts', 'accounts.id', 'other.account_id')
      .select('accounts.id')
      .where('mine.account_id', '=', account)
      .where('accounts.player_id', '=', playerId)
      .executeTakeFirst()
    return row === undefined ? null : idFrom<'AccountId'>(row.id)
  }

  async householdOf(account: AccountId): Promise<string | null> {
    const row = await this.db
      .selectFrom('household_members')
      .select('household_id')
      .where('account_id', '=', account)
      .executeTakeFirst()
    return row?.household_id ?? null
  }
}
