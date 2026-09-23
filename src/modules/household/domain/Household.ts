import type { Email } from '@/core/Email'
import type { AccountId, HouseholdId, InvitationId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import {
  AlreadyHouseholdMemberError,
  AlreadyInvitedError,
  HouseholdFullError,
  InvitationNotFoundError,
  type InvalidHouseholdNameError,
  MemberNotFoundError,
  NotHouseholdOwnerError,
  OwnerCannotLeaveError,
} from './errors'
import { checkHouseholdName, INVITATION_TTL_MS, MAX_MEMBERS } from './policies'

/** Compte qui agit sur le foyer. L'adresse est celle, confirmée, de son compte. */
export interface HouseholdActor {
  readonly id: AccountId
  readonly email: Email
}

export interface HouseholdMember {
  readonly accountId: AccountId
  readonly email: Email
  readonly joinedAt: Date
  /** Les autres membres peuvent consulter ses journées. */
  readonly sharesDays: boolean
}

/** Invitation en attente. Acceptée, refusée ou révoquée, elle disparaît du foyer. */
export interface Invitation {
  readonly id: InvitationId
  readonly email: Email
  readonly invitedAt: Date
  readonly expiresAt: Date
}

export interface HouseholdProps {
  readonly id: HouseholdId
  readonly name: string
  readonly ownerId: AccountId
  readonly members: readonly HouseholdMember[]
  readonly invitations: readonly Invitation[]
  /**
   * Version enregistrée, 0 avant le premier enregistrement. Le dépôt refuse
   * d'écrire un foyer dont la version a changé depuis sa lecture : deux
   * modifications simultanées ne s'écrasent pas en silence.
   */
  readonly version: number
}

/**
 * Foyer — racine d'agrégat, partagée par le client et le serveur.
 *
 * Le serveur fait autorité : c'est lui qui applique ces règles avant
 * d'enregistrer. Le client ne s'en sert que pour valider une saisie avant
 * l'envoi.
 *
 * Invariants :
 * - le propriétaire est toujours membre, et ne « quitte » pas : il dissout ;
 * - seul le propriétaire invite, révoque et retire ;
 * - au plus `MAX_MEMBERS` membres, invitations en attente comprises — sans
 *   quoi on inviterait plus de monde que le foyer ne peut en accueillir ;
 * - une adresse n'est invitée qu'une fois à la fois, et jamais celle d'un membre ;
 * - une invitation périme au bout de `INVITATION_TTL_MS`, et ne s'accepte
 *   qu'avec l'adresse à laquelle elle a été envoyée.
 *
 * Qu'un compte n'appartienne qu'à **un** foyer traverse les agrégats : c'est
 * au use case de le vérifier, et à la base de le garantir en dernier recours.
 */
export class Household {
  private constructor(private readonly props: HouseholdProps) {}

  static found(input: {
    readonly id: HouseholdId
    readonly name: string
    readonly owner: HouseholdActor
    readonly at: Date
  }): Result<Household, InvalidHouseholdNameError> {
    const name = checkHouseholdName(input.name)
    if (!name.ok) return name

    return ok(
      new Household({
        id: input.id,
        name: name.value,
        ownerId: input.owner.id,
        members: [
          { accountId: input.owner.id, email: input.owner.email, joinedAt: input.at, sharesDays: true },
        ],
        invitations: [],
        version: 0,
      }),
    )
  }

  static reconstitute(props: HouseholdProps): Household {
    return new Household(props)
  }

  get id(): HouseholdId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get ownerId(): AccountId {
    return this.props.ownerId
  }

  get members(): readonly HouseholdMember[] {
    return this.props.members
  }

  get version(): number {
    return this.props.version
  }

  /** Toutes les invitations enregistrées, périmées comprises. */
  get invitations(): readonly Invitation[] {
    return this.props.invitations
  }

  /** Invitations auxquelles on peut encore répondre. */
  pendingInvitations(now: Date): readonly Invitation[] {
    return this.props.invitations.filter((invitation) => invitation.expiresAt > now)
  }

  isOwner(accountId: AccountId): boolean {
    return this.props.ownerId === accountId
  }

  memberOf(accountId: AccountId): HouseholdMember | undefined {
    return this.props.members.find((member) => member.accountId === accountId)
  }

  invite(
    by: AccountId,
    input: { readonly id: InvitationId; readonly email: Email; readonly at: Date },
  ): Result<
    Household,
    NotHouseholdOwnerError | AlreadyHouseholdMemberError | AlreadyInvitedError | HouseholdFullError
  > {
    if (!this.isOwner(by)) return err(new NotHouseholdOwnerError())
    if (this.props.members.some((member) => member.email.equals(input.email))) {
      return err(new AlreadyHouseholdMemberError())
    }

    // Les invitations périmées ne comptent plus : on en profite pour les oublier.
    const pending = this.pendingInvitations(input.at)
    if (pending.some((invitation) => invitation.email.equals(input.email))) {
      return err(new AlreadyInvitedError())
    }
    if (this.props.members.length + pending.length >= MAX_MEMBERS) {
      return err(new HouseholdFullError(MAX_MEMBERS))
    }

    const invitation: Invitation = {
      id: input.id,
      email: input.email,
      invitedAt: input.at,
      expiresAt: new Date(input.at.getTime() + INVITATION_TTL_MS),
    }
    return ok(this.with({ invitations: [...pending, invitation] }))
  }

  /**
   * Acceptation par la personne invitée. Posséder l'adresse — prouvée par la
   * confirmation du compte — vaut droit d'entrer ; l'identifiant seul ne
   * suffit pas.
   */
  accept(
    invitationId: InvitationId,
    by: HouseholdActor,
    at: Date,
  ): Result<Household, InvitationNotFoundError | AlreadyHouseholdMemberError | HouseholdFullError> {
    const invitation = this.addressedTo(invitationId, by, at)
    if (invitation === undefined) return err(new InvitationNotFoundError())
    if (this.memberOf(by.id) !== undefined) return err(new AlreadyHouseholdMemberError())
    if (this.props.members.length >= MAX_MEMBERS) return err(new HouseholdFullError(MAX_MEMBERS))

    return ok(
      this.with({
        members: [
          ...this.props.members,
          // Le partage des journées est annoncé à l'acceptation : il est actif
          // dès l'entrée, et chacun peut le couper ensuite.
          { accountId: by.id, email: by.email, joinedAt: at, sharesDays: true },
        ],
        invitations: this.withoutInvitation(invitationId),
      }),
    )
  }

  decline(
    invitationId: InvitationId,
    by: HouseholdActor,
    at: Date,
  ): Result<Household, InvitationNotFoundError> {
    if (this.addressedTo(invitationId, by, at) === undefined) {
      return err(new InvitationNotFoundError())
    }
    return ok(this.with({ invitations: this.withoutInvitation(invitationId) }))
  }

  revoke(
    by: AccountId,
    invitationId: InvitationId,
  ): Result<Household, NotHouseholdOwnerError | InvitationNotFoundError> {
    if (!this.isOwner(by)) return err(new NotHouseholdOwnerError())
    if (!this.props.invitations.some((invitation) => invitation.id === invitationId)) {
      return err(new InvitationNotFoundError())
    }
    return ok(this.with({ invitations: this.withoutInvitation(invitationId) }))
  }

  removeMember(
    by: AccountId,
    accountId: AccountId,
  ): Result<Household, NotHouseholdOwnerError | OwnerCannotLeaveError | MemberNotFoundError> {
    if (!this.isOwner(by)) return err(new NotHouseholdOwnerError())
    return this.leave(accountId)
  }

  leave(accountId: AccountId): Result<Household, OwnerCannotLeaveError | MemberNotFoundError> {
    if (this.isOwner(accountId)) return err(new OwnerCannotLeaveError())
    if (this.memberOf(accountId) === undefined) return err(new MemberNotFoundError())

    return ok(
      this.with({
        members: this.props.members.filter((member) => member.accountId !== accountId),
      }),
    )
  }

  /** Le foyer disparaît avec ses invitations ; chaque membre redevient seul. */
  dissolve(by: AccountId): Result<void, NotHouseholdOwnerError> {
    return this.isOwner(by) ? ok(undefined) : err(new NotHouseholdOwnerError())
  }

  setDaySharing(accountId: AccountId, sharesDays: boolean): Result<Household, MemberNotFoundError> {
    const member = this.memberOf(accountId)
    if (member === undefined) return err(new MemberNotFoundError())
    if (member.sharesDays === sharesDays) return ok(this)

    return ok(
      this.with({
        members: this.props.members.map((candidate) =>
          candidate === member ? { ...member, sharesDays } : candidate,
        ),
      }),
    )
  }

  private addressedTo(
    invitationId: InvitationId,
    by: HouseholdActor,
    at: Date,
  ): Invitation | undefined {
    return this.pendingInvitations(at).find(
      (invitation) => invitation.id === invitationId && invitation.email.equals(by.email),
    )
  }

  private withoutInvitation(invitationId: InvitationId): readonly Invitation[] {
    return this.props.invitations.filter((invitation) => invitation.id !== invitationId)
  }

  private with(changes: Partial<Pick<HouseholdProps, 'members' | 'invitations'>>): Household {
    return new Household({ ...this.props, ...changes })
  }
}
