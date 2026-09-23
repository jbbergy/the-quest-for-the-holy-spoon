import { Email } from '@/core/Email'
import { type AccountId, type HouseholdId, idFrom, type InvitationId } from '@/core/identity'
import { Household } from '@/modules/household/domain/Household'
import type { ReceivedInvitationView } from '@/modules/household/domain/views'

import type { Db } from '../../../shared/db/database'
import type { IHouseholdRepository, SaveOutcome } from '../domain/ports'

/** Violation d'unicité Postgres : ici, un compte déjà membre d'un autre foyer. */
const UNIQUE_VIOLATION = '23505'

/**
 * Le foyer est lu et écrit d'un bloc, comme tout agrégat : l'en-tête, ses
 * membres et ses invitations. L'écriture remplace membres et invitations dans
 * la même transaction que la montée de version — un foyer ne s'enregistre
 * jamais à moitié.
 */
export class KyselyHouseholdRepository implements IHouseholdRepository {
  constructor(private readonly db: Db) {}

  async findByMember(accountId: AccountId): Promise<Household | null> {
    const row = await this.db
      .selectFrom('household_members')
      .select('household_id')
      .where('account_id', '=', accountId)
      .executeTakeFirst()
    return row === undefined ? null : this.load(row.household_id)
  }

  async findByInvitation(invitationId: InvitationId): Promise<Household | null> {
    const row = await this.db
      .selectFrom('household_invitations')
      .select('household_id')
      .where('id', '=', invitationId)
      .executeTakeFirst()
    return row === undefined ? null : this.load(row.household_id)
  }

  async receivedBy(email: Email, now: Date): Promise<readonly ReceivedInvitationView[]> {
    const rows = await this.db
      .selectFrom('household_invitations as invitation')
      .innerJoin('households as household', 'household.id', 'invitation.household_id')
      .innerJoin('accounts as owner', 'owner.id', 'household.owner_account_id')
      .select([
        'invitation.id',
        'invitation.expires_at',
        'household.name',
        'owner.email as owner_email',
      ])
      .where('invitation.email', '=', email.value)
      .where('invitation.expires_at', '>', now)
      .orderBy('invitation.invited_at')
      .execute()

    return rows.map((row) => ({
      id: idFrom<'InvitationId'>(row.id),
      householdName: row.name,
      invitedBy: row.owner_email,
      expiresAt: row.expires_at,
    }))
  }

  async save(household: Household): Promise<SaveOutcome> {
    try {
      return await this.db.transaction().execute(async (tx) => {
        if (household.version === 0) {
          await tx
            .insertInto('households')
            .values({ id: household.id, name: household.name, owner_account_id: household.ownerId })
            .execute()
        } else {
          const updated = await tx
            .updateTable('households')
            .set((eb) => ({ name: household.name, version: eb('version', '+', 1) }))
            .where('id', '=', household.id)
            .where('version', '=', household.version)
            .executeTakeFirst()
          if (updated.numUpdatedRows === 0n) return 'conflict'

          await tx.deleteFrom('household_members').where('household_id', '=', household.id).execute()
          await tx.deleteFrom('household_invitations').where('household_id', '=', household.id).execute()
        }

        await tx
          .insertInto('household_members')
          .values(
            household.members.map((member) => ({
              account_id: member.accountId,
              household_id: household.id,
              joined_at: member.joinedAt,
              shares_days: member.sharesDays,
            })),
          )
          .execute()
        if (household.invitations.length > 0) {
          await tx
            .insertInto('household_invitations')
            .values(
              household.invitations.map((invitation) => ({
                id: invitation.id,
                household_id: household.id,
                email: invitation.email.value,
                invited_at: invitation.invitedAt,
                expires_at: invitation.expiresAt,
              })),
            )
            .execute()
        }
        return 'saved' as const
      })
    } catch (error) {
      if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return 'conflict'
      throw error
    }
  }

  async delete(id: HouseholdId): Promise<void> {
    // Membres et invitations partent avec le foyer (`on delete cascade`).
    await this.db.deleteFrom('households').where('id', '=', id).execute()
  }

  private async load(id: string): Promise<Household | null> {
    const household = await this.db
      .selectFrom('households')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (household === undefined) return null

    const [members, invitations] = await Promise.all([
      this.db
        .selectFrom('household_members as member')
        .innerJoin('accounts as account', 'account.id', 'member.account_id')
        .select(['member.account_id', 'member.joined_at', 'member.shares_days', 'account.email'])
        .where('member.household_id', '=', id)
        .orderBy('member.joined_at')
        .execute(),
      this.db
        .selectFrom('household_invitations')
        .selectAll()
        .where('household_id', '=', id)
        .orderBy('invited_at')
        .execute(),
    ])

    return Household.reconstitute({
      id: idFrom<'HouseholdId'>(household.id),
      name: household.name,
      ownerId: idFrom<'AccountId'>(household.owner_account_id),
      version: household.version,
      members: members.map((row) => ({
        accountId: idFrom<'AccountId'>(row.account_id),
        email: Email.reconstitute(row.email),
        joinedAt: row.joined_at,
        sharesDays: row.shares_days,
      })),
      invitations: invitations.map((row) => ({
        id: idFrom<'InvitationId'>(row.id),
        email: Email.reconstitute(row.email),
        invitedAt: row.invited_at,
        expiresAt: row.expires_at,
      })),
    })
  }
}
