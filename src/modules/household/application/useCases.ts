import { Email } from '@/core/Email'
import type { DomainError } from '@/core/errors'
import type { AccountId, InvitationId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { HouseholdGatewayError, IHouseholdGateway } from '../domain/HouseholdGateway'
import { checkHouseholdName } from '../domain/policies'
import type { HouseholdView, ReceivedInvitationView } from '../domain/views'

export type HouseholdError = DomainError | HouseholdGatewayError

/**
 * Use cases du foyer, côté client.
 *
 * Le serveur tranche tout ce qui touche au foyer ; le client ne juge d'avance
 * que la saisie — nom du foyer, adresse invitée — pour que l'erreur s'affiche
 * aussitôt, même hors connexion.
 */
export class GetHouseholdUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(): Promise<Result<HouseholdView | null, HouseholdError>> {
    return this.gateway.current()
  }
}

export class CreateHouseholdUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  async execute(rawName: string): Promise<Result<HouseholdView, HouseholdError>> {
    const name = checkHouseholdName(rawName)
    if (!name.ok) return name
    return this.gateway.create(name.value)
  }
}

export class InviteToHouseholdUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  async execute(rawEmail: string): Promise<Result<void, HouseholdError>> {
    const email = Email.create(rawEmail)
    if (!email.ok) return email
    return this.gateway.invite(email.value)
  }
}

export class RevokeInvitationUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdError>> {
    return this.gateway.revoke(invitationId)
  }
}

export class RemoveMemberUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(accountId: AccountId): Promise<Result<HouseholdView, HouseholdError>> {
    return this.gateway.removeMember(accountId)
  }
}

export class LeaveHouseholdUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(): Promise<Result<void, HouseholdError>> {
    return this.gateway.leave()
  }
}

export class DissolveHouseholdUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(): Promise<Result<void, HouseholdError>> {
    return this.gateway.dissolve()
  }
}

export class SetDaySharingUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(sharesDays: boolean): Promise<Result<HouseholdView, HouseholdError>> {
    return this.gateway.setDaySharing(sharesDays)
  }
}

export class ListReceivedInvitationsUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(): Promise<Result<readonly ReceivedInvitationView[], HouseholdError>> {
    return this.gateway.receivedInvitations()
  }
}

export class AcceptInvitationUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdError>> {
    return this.gateway.accept(invitationId)
  }
}

export class DeclineInvitationUseCase {
  constructor(private readonly gateway: IHouseholdGateway) {}

  execute(invitationId: InvitationId): Promise<Result<void, HouseholdError>> {
    return this.gateway.decline(invitationId)
  }
}
