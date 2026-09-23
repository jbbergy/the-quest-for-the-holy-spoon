import { type AccountId, idFrom } from '@/core/identity'

import type { Db } from '../../../shared/db/database'
import { hashToken, newToken } from '../../../shared/secrets'
import type { ISessionStore, SessionRecord } from '../domain/ports'

/** Sessions en base ; seule l'empreinte du jeton y est écrite. */
export class KyselySessionStore implements ISessionStore {
  constructor(private readonly db: Db) {}

  async open(accountId: AccountId, expiresAt: Date): Promise<string> {
    const { token, hash } = newToken()
    await this.db
      .insertInto('sessions')
      .values({ token_hash: hash, account_id: accountId, expires_at: expiresAt })
      .execute()
    return token
  }

  async find(token: string, now: Date): Promise<SessionRecord | null> {
    const row = await this.db
      .selectFrom('sessions')
      .select(['account_id', 'expires_at'])
      .where('token_hash', '=', hashToken(token))
      .where('expires_at', '>', now)
      .executeTakeFirst()
    return row === undefined
      ? null
      : { accountId: idFrom<'AccountId'>(row.account_id), expiresAt: row.expires_at }
  }

  async extend(token: string, expiresAt: Date): Promise<void> {
    await this.db
      .updateTable('sessions')
      .set({ expires_at: expiresAt })
      .where('token_hash', '=', hashToken(token))
      .execute()
  }

  async close(token: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('token_hash', '=', hashToken(token)).execute()
  }

  async closeAll(accountId: AccountId): Promise<void> {
    await this.db.deleteFrom('sessions').where('account_id', '=', accountId).execute()
  }
}
