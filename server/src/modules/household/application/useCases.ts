import { Email } from '@/core/Email'
import type { DomainError } from '@/core/errors'
import { type AccountId, type InvitationId, newId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'
import { AlreadyInHouseholdError, InvitationNotFoundError } from '@/modules/household/domain/errors'
import { Household, type HouseholdActor } from '@/modules/household/domain/Household'
import {
  type HouseholdView,
  type ReceivedInvitationView,
  viewHousehold,
} from '@/modules/household/domain/views'

import type { Clock, IHouseholdNotifier, IHouseholdRepository } from '../domain/ports'

import { HouseholdConflictError, HouseholdEmailNotVerifiedError, NoHouseholdError } from './errors'

export interface HouseholdDependencies {
  readonly households: IHouseholdRepository
  readonly notifier: IHouseholdNotifier
  readonly clock: Clock
}

/** Ce que le foyer sait du compte connecté. */
export interface HouseholdAccount extends HouseholdActor {
  readonly isVerified: boolean
}

type Refusal = DomainError | NoHouseholdError | HouseholdConflictError | HouseholdEmailNotVerifiedError

/**
 * Socle commun des use cases : tous exigent une adresse confirmée, et tous
 * enregistrent de la même façon — un conflit de version devient un refus
 * explicite, que le client présente comme « réessayez ».
 */
abstract class HouseholdUseCase {
  constructor(protected readonly deps: HouseholdDependencies) {}

  protected verified(account: HouseholdAccount): Result<HouseholdAccount, HouseholdEmailNotVerifiedError> {
    return account.isVerified ? ok(account) : err(new HouseholdEmailNotVerifiedError())
  }

  /** Foyer du compte, ou refus : les actions sur « mon foyer » en exigent un. */
  protected async householdOf(account: HouseholdAccount): Promise<Result<Household, Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified
    const household = await this.deps.households.findByMember(account.id)
    return household === null ? err(new NoHouseholdError()) : ok(household)
  }

  protected async persist(household: Household): Promise<Result<Household, HouseholdConflictError>> {
    const outcome = await this.deps.households.save(household)
    return outcome === 'saved' ? ok(household) : err(new HouseholdConflictError())
  }

  /** Vue d'un foyer dont le compte est forcément membre, sans quoi c'est un bug. */
  protected view(household: Household, viewer: AccountId): HouseholdView {
    const view = viewHousehold(household, viewer, this.deps.clock())
    if (view === undefined) throw new Error(`Le compte ${viewer} n’est pas membre du foyer ${household.id}.`)
    return view
  }

  /** Enregistre le foyer modifié et renvoie la vue qu'en a le compte. */
  protected async saveAndView(
    changed: Result<Household, DomainError>,
    viewer: AccountId,
  ): Promise<Result<HouseholdView, Refusal>> {
    if (!changed.ok) return changed
    const saved = await this.persist(changed.value)
    return saved.ok ? ok(this.view(saved.value, viewer)) : saved
  }
}

export class GetHouseholdUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount): Promise<Result<HouseholdView | null, Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified
    const household = await this.deps.households.findByMember(account.id)
    return ok(household === null ? null : this.view(household, account.id))
  }
}

export class CreateHouseholdUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, name: string): Promise<Result<HouseholdView, Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified
    if ((await this.deps.households.findByMember(account.id)) !== null) {
      return err(new AlreadyInHouseholdError())
    }

    const founded = Household.found({ id: newId<'HouseholdId'>(), name, owner: account, at: this.deps.clock() })
    if (!founded.ok) return founded
    // Seul conflit possible à la création : le compte vient d'entrer dans un
    // autre foyer, par une requête concurrente.
    if ((await this.deps.households.save(founded.value)) === 'conflict') {
      return err(new AlreadyInHouseholdError())
    }
    return ok(this.view(founded.value, account.id))
  }
}

/**
 * Invitation par adresse.
 *
 * La réponse est la même que l'adresse ait un compte ou non : le propriétaire
 * n'apprend rien de ce qu'il ne savait déjà. La personne invitée l'apprend par
 * e-mail, et trouvera l'invitation en se connectant — ou en créant son compte
 * avec cette adresse.
 */
export class InviteUseCase extends HouseholdUseCase {
  async execute(
    account: HouseholdAccount,
    rawEmail: string,
    linkBase: string,
  ): Promise<Result<void, Refusal>> {
    const email = Email.create(rawEmail)
    if (!email.ok) return email
    const household = await this.householdOf(account)
    if (!household.ok) return household

    const at = this.deps.clock()
    const invited = household.value.invite(account.id, { id: newId<'InvitationId'>(), email: email.value, at })
    if (!invited.ok) return invited
    const saved = await this.persist(invited.value)
    if (!saved.ok) return saved

    const invitation = saved.value.pendingInvitations(at).find((pending) => pending.email.equals(email.value))
    await this.deps.notifier.invited(
      email.value,
      {
        householdName: saved.value.name,
        invitedBy: account.email,
        expiresAt: invitation?.expiresAt ?? at,
      },
      linkBase,
    )
    return ok(undefined)
  }
}

export class RevokeInvitationUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, invitationId: InvitationId): Promise<Result<HouseholdView, Refusal>> {
    const household = await this.householdOf(account)
    if (!household.ok) return household
    return this.saveAndView(household.value.revoke(account.id, invitationId), account.id)
  }
}

export class RemoveMemberUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, memberId: AccountId): Promise<Result<HouseholdView, Refusal>> {
    const household = await this.householdOf(account)
    if (!household.ok) return household
    return this.saveAndView(household.value.removeMember(account.id, memberId), account.id)
  }
}

export class SetDaySharingUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, sharesDays: boolean): Promise<Result<HouseholdView, Refusal>> {
    const household = await this.householdOf(account)
    if (!household.ok) return household

    const changed = household.value.setDaySharing(account.id, sharesDays)
    // Rien à écrire quand le réglage était déjà celui demandé.
    if (changed.ok && changed.value === household.value) return ok(this.view(changed.value, account.id))
    return this.saveAndView(changed, account.id)
  }
}

export class LeaveHouseholdUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount): Promise<Result<void, Refusal>> {
    const household = await this.householdOf(account)
    if (!household.ok) return household

    const left = household.value.leave(account.id)
    if (!left.ok) return left
    const saved = await this.persist(left.value)
    return saved.ok ? ok(undefined) : saved
  }
}

export class DissolveHouseholdUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount): Promise<Result<void, Refusal>> {
    const household = await this.householdOf(account)
    if (!household.ok) return household

    const dissolved = household.value.dissolve(account.id)
    if (!dissolved.ok) return dissolved
    await this.deps.households.delete(household.value.id)
    return ok(undefined)
  }
}

export class ListReceivedInvitationsUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount): Promise<Result<readonly ReceivedInvitationView[], Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified
    return ok(await this.deps.households.receivedBy(account.email, this.deps.clock()))
  }
}

export class AcceptInvitationUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, invitationId: InvitationId): Promise<Result<HouseholdView, Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified
    // Un seul foyer par compte : il faut quitter le sien avant d'en rejoindre un autre.
    if ((await this.deps.households.findByMember(account.id)) !== null) {
      return err(new AlreadyInHouseholdError())
    }

    const household = await this.deps.households.findByInvitation(invitationId)
    if (household === null) return err(new InvitationNotFoundError())
    return this.saveAndView(household.accept(invitationId, account, this.deps.clock()), account.id)
  }
}

export class DeclineInvitationUseCase extends HouseholdUseCase {
  async execute(account: HouseholdAccount, invitationId: InvitationId): Promise<Result<void, Refusal>> {
    const verified = this.verified(account)
    if (!verified.ok) return verified

    const household = await this.deps.households.findByInvitation(invitationId)
    if (household === null) return err(new InvitationNotFoundError())
    const declined = household.decline(invitationId, account, this.deps.clock())
    if (!declined.ok) return declined
    const saved = await this.persist(declined.value)
    return saved.ok ? ok(undefined) : saved
  }
}
