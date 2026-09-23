import { type AccountId, idFrom } from '@/core/identity'
import { Email } from '@/core/Email'

import type { Db } from '../../../shared/db/database'
import type { AccountRow } from '../../../shared/db/schema'
import { Account } from '../domain/Account'
import type { IAccountRepository } from '../domain/ports'

export class KyselyAccountRepository implements IAccountRepository {
  constructor(private readonly db: Db) {}

  async findById(id: AccountId): Promise<Account | null> {
    const row = await this.db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirst()
    return row === undefined ? null : toAccount(row)
  }

  async findByEmail(email: Email): Promise<Account | null> {
    const row = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('email', '=', email.value)
      .executeTakeFirst()
    return row === undefined ? null : toAccount(row)
  }

  async isPlayerTaken(playerId: string, except: AccountId): Promise<boolean> {
    const row = await this.db
      .selectFrom('accounts')
      .select('id')
      .where('player_id', '=', playerId)
      .where('id', '!=', except)
      .executeTakeFirst()
    return row !== undefined
  }

  async save(account: Account): Promise<void> {
    const values = {
      email: account.email.value,
      password_hash: account.passwordHash,
      email_verified_at: account.emailVerifiedAt,
      player_id: account.playerId,
    }
    await this.db
      .insertInto('accounts')
      .values({ id: account.id, ...values })
      .onConflict((conflict) => conflict.column('id').doUpdateSet(values))
      .execute()
  }

  async delete(id: AccountId): Promise<void> {
    // Sessions et liens partent avec le compte (`on delete cascade`).
    await this.db.deleteFrom('accounts').where('id', '=', id).execute()
  }
}

function toAccount(row: AccountRow): Account {
  return Account.reconstitute({
    id: idFrom<'AccountId'>(row.id),
    email: Email.reconstitute(row.email),
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    playerId: row.player_id === null ? null : idFrom<'PlayerId'>(row.player_id),
  })
}
