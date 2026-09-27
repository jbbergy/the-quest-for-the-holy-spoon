import { sql } from 'kysely'

import type { DayKey } from '@/core/day'
import { type AccountId, idFrom } from '@/core/identity'
import type { MemberProfile } from '@/modules/household/domain/views'

import type { Db } from '../../../shared/db/database'
import type { IMemberDirectory, MemberDays, SyncedRecord } from '../domain/ports'

/**
 * Ce que les membres ont publié, lu dans la table de synchronisation.
 *
 * Seules deux entités d'autrui sont lues ici : `needs` (nom et besoins
 * calculés) et `meal`. L'entité `player`, qui porte les mensurations, n'est
 * jamais touchée.
 */
export class KyselyMemberDirectory implements IMemberDirectory {
  constructor(private readonly db: Db) {}

  async profiles(accountIds: readonly AccountId[]): Promise<ReadonlyMap<AccountId, MemberProfile>> {
    if (accountIds.length === 0) return new Map()

    const rows = await this.db
      .selectFrom('accounts')
      .leftJoin('records', (join) =>
        join
          .onRef('records.id', '=', 'accounts.player_id')
          .on('records.entity', '=', 'needs')
          .onRef('records.owner_account_id', '=', 'accounts.id')
          .on('records.deleted', '=', false),
      )
      .select(['accounts.id', 'accounts.player_id', 'records.payload'])
      .where('accounts.id', 'in', [...accountIds])
      .where('accounts.player_id', 'is not', null)
      .execute()

    return new Map(
      rows.map((row) => [
        idFrom<'AccountId'>(row.id),
        {
          playerId: idFrom<'PlayerId'>(row.player_id!),
          name: stringOr(row.payload?.name),
          targetCalories: numberOr(row.payload?.targetCalories),
        },
      ]),
    )
  }

  async days(accountId: AccountId, from: DayKey, to: DayKey): Promise<MemberDays> {
    const [meals, needs] = await Promise.all([
      sql<{ payload: SyncedRecord }>`
        select payload from records
          where entity = 'meal' and owner_account_id = ${accountId} and not deleted
            and payload->>'dayKey' between ${from} and ${to}
          order by payload->>'dayKey', payload->>'loggedAt'`.execute(this.db),
      this.db
        .selectFrom('records')
        .innerJoin('accounts', 'accounts.player_id', 'records.id')
        .select('records.payload')
        .where('records.entity', '=', 'needs')
        .where('records.owner_account_id', '=', accountId)
        .where('accounts.id', '=', accountId)
        .where('records.deleted', '=', false)
        .executeTakeFirst(),
    ])
    return { meals: meals.rows.map((row) => row.payload), needs: needs?.payload ?? null }
  }
}

const stringOr = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const numberOr = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
