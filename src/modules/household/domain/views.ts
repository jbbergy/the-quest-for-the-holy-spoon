import type { AccountId, HouseholdId, InvitationId, PlayerId } from '@/core/identity'

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
  /** Profil rattaché au compte ; `null` tant que le membre n'en a pas. */
  readonly playerId: PlayerId | null
  /** Nom du profil, ou `null` s'il ne l'a pas encore publié : on affiche alors l'adresse. */
  readonly name: string | null
  /** Besoin calorique habituel, pour ajuster les portions d'un repas prévu pour lui. */
  readonly targetCalories: number | null
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

/**
 * Ce que le foyer sait du profil d'un membre : ce qu'il a lui-même publié (nom
 * et besoins calculés), jamais ses mensurations.
 */
export interface MemberProfile {
  readonly playerId: PlayerId
  readonly name: string | null
  readonly targetCalories: number | null
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
  profiles: ReadonlyMap<AccountId, MemberProfile> = new Map(),
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
      playerId: profiles.get(member.accountId)?.playerId ?? null,
      name: profiles.get(member.accountId)?.name ?? null,
      targetCalories: profiles.get(member.accountId)?.targetCalories ?? null,
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
