import { type AccountId, idFrom } from '@/core/identity'

import type { Db } from '../../../shared/db/database'
import { hashToken, newToken } from '../../../shared/secrets'
import type { EmailTokenPurpose } from '../domain/policies'
import type { IEmailTokenStore } from '../domain/ports'

export class KyselyEmailTokenStore implements IEmailTokenStore {
  constructor(private readonly db: Db) {}

  /**
   * Les liens antérieurs de même nature sont révoqués dans la même transaction :
   * seul le dernier e-mail reçu fonctionne, et un ancien message resté dans une
   * boîte ne sert plus.
   */
  async issue(accountId: AccountId, purpose: EmailTokenPurpose, expiresAt: Date): Promise<string> {
    const { token, hash } = newToken()

    await this.db.transaction().execute(async (tx) => {
      await tx
        .deleteFrom('email_tokens')
        .where('account_id', '=', accountId)
        .where('purpose', '=', purpose)
        .execute()
      await tx
        .insertInto('email_tokens')
        .values({ token_hash: hash, account_id: accountId, purpose, expires_at: expiresAt, used_at: null })
        .execute()
    })

    return token
  }

  /** Marquage atomique : deux clics simultanés sur le même lien ne l'utilisent qu'une fois. */
  async consume(token: string, purpose: EmailTokenPurpose, now: Date): Promise<AccountId | null> {
    const row = await this.db
      .updateTable('email_tokens')
      .set({ used_at: now })
      .where('token_hash', '=', hashToken(token))
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .where('expires_at', '>', now)
      .returning('account_id')
      .executeTakeFirst()

    return row === undefined ? null : idFrom<'AccountId'>(row.account_id)
  }
}
