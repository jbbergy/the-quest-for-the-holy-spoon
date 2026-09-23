import type { AccountId, HouseholdId, InvitationId } from '@/core/identity'

import type { Household } from './Household'

/**
 * Ce qu'un membre voit de son foyer.
 *
 * Écrit une seule fois ici : le serveur le calcule depuis l'agrégat, le client
 * le reçoit tel quel. Les invitations en attente ne sont montrées qu'au
 * propriétaire, seul à pouvoir y toucher.
 */
export interface HouseholdMemberView {
  readonly accountId: AccountId
  readonly email: string
  readonly isOwner: boolean
  readonly joinedAt: Date
  readonly sharesDays: boolean
}

export interface PendingInvitationView {
  readonly id: InvitationId
  readonly email: string
  readonly expiresAt: Date
}

export type HouseholdRole = 'owner' | 'member'

export interface HouseholdView {
  readonly id: HouseholdId
  readonly name: string
  readonly role: HouseholdRole
  /** Le propriétaire d'abord, puis par ordre d'arrivée. */
  readonly members: readonly HouseholdMemberView[]
  readonly invitations: readonly PendingInvitationView[]
  /** Réglage du compte qui regarde : partage-t-il ses journées ? */
  readonly sharesDays: boolean
}

/** Invitation vue par la personne qui la reçoit. */
export interface ReceivedInvitationView {
  readonly id: InvitationId
  readonly householdName: string
  /** Adresse du propriétaire : on sait qui invite avant de répondre. */
  readonly invitedBy: string
  readonly expiresAt: Date
}

/** Projection du foyer pour l'un de ses membres. `undefined` s'il n'en est pas membre. */
export function viewHousehold(
  household: Household,
  viewer: AccountId,
  now: Date,
): HouseholdView | undefined {
  const self = household.memberOf(viewer)
  if (self === undefined) return undefined
  const isOwner = household.isOwner(viewer)

  const members = [...household.members]
    .sort(
      (a, b) =>
        Number(household.isOwner(b.accountId)) - Number(household.isOwner(a.accountId)) ||
        a.joinedAt.getTime() - b.joinedAt.getTime(),
    )
    .map((member) => ({
      accountId: member.accountId,
      email: member.email.value,
      isOwner: household.isOwner(member.accountId),
      joinedAt: member.joinedAt,
      sharesDays: member.sharesDays,
    }))

  return {
    id: household.id,
    name: household.name,
    role: isOwner ? 'owner' : 'member',
    members,
    invitations: isOwner
      ? household
          .pendingInvitations(now)
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.email.value,
            expiresAt: invitation.expiresAt,
          }))
      : [],
    sharesDays: self.sharesDays,
  }
}
