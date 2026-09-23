import type { Email } from '@/core/Email'
import type { AccountId, HouseholdId, InvitationId } from '@/core/identity'
import type { Household } from '@/modules/household/domain/Household'
import type { ReceivedInvitationView } from '@/modules/household/domain/views'

/**
 * Ports du module `household` côté serveur. L'agrégat et ses règles viennent
 * du domaine partagé avec le client : ils ne sont écrits qu'une fois.
 */

/**
 * `conflict` : le foyer a changé depuis sa lecture, ou un nouveau membre a
 * rejoint un autre foyer entre-temps. Rien n'a été écrit.
 */
export type SaveOutcome = 'saved' | 'conflict'

export interface IHouseholdRepository {
  findByMember(accountId: AccountId): Promise<Household | null>
  findByInvitation(invitationId: InvitationId): Promise<Household | null>
  /** Invitations encore valables adressées à cette adresse, tous foyers confondus. */
  receivedBy(email: Email, now: Date): Promise<readonly ReceivedInvitationView[]>
  /** Crée le foyer (version 0) ou l'enregistre si sa version n'a pas bougé. */
  save(household: Household): Promise<SaveOutcome>
  delete(id: HouseholdId): Promise<void>
}

export interface InvitationNotice {
  readonly householdName: string
  readonly invitedBy: Email
  readonly expiresAt: Date
}

/** Prévient la personne invitée. `linkBase` : origine de l'application. */
export interface IHouseholdNotifier {
  invited(to: Email, notice: InvitationNotice, linkBase: string): Promise<void>
}

export type Clock = () => Date
