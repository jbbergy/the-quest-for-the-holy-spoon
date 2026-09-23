import { acceptedResponseSchema } from '@/contract/account'
import { ApiClient } from '@/contract/apiClient'
import {
  HOUSEHOLD_ROUTE,
  type HouseholdPayload,
  householdResponseSchema,
  receivedInvitationsResponseSchema,
} from '@/contract/household'
import type { Email } from '@/core/Email'
import { ExternalPayloadInvalidError } from '@/core/errors'
import { type AccountId, idFrom, type InvitationId } from '@/core/identity'
import { err, map, ok, type Result } from '@/core/result'

import type { HouseholdGatewayError, IHouseholdGateway } from '../domain/HouseholdGateway'
import type { HouseholdView, ReceivedInvitationView } from '../domain/views'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** Adaptateur HTTP des foyers, sur le client du contrat. */
export class HttpHouseholdGateway implements IHouseholdGateway {
  constructor(private readonly api: ApiClient = new ApiClient()) {}

  async current(): Promise<Result<HouseholdView | null, HouseholdGatewayError>> {
    const response = await this.api.request('GET', HOUSEHOLD_ROUTE.household, householdResponseSchema)
    return map(response, ({ household }) => (household === null ? null : toView(household)))
  }

  create(name: string): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    return this.household('POST', HOUSEHOLD_ROUTE.household, { name })
  }

  async invite(email: Email): Promise<Result<void, HouseholdGatewayError>> {
    const response = await this.api.request('POST', HOUSEHOLD_ROUTE.invitations, acceptedResponseSchema, {
      email: email.value,
    })
    return map(response, () => undefined)
  }

  revoke(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    return this.household('DELETE', HOUSEHOLD_ROUTE.invitation(invitationId))
  }

  removeMember(accountId: AccountId): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    return this.household('DELETE', HOUSEHOLD_ROUTE.member(accountId))
  }

  leave(): Promise<Result<void, HouseholdGatewayError>> {
    return this.api.send('POST', HOUSEHOLD_ROUTE.leave)
  }

  dissolve(): Promise<Result<void, HouseholdGatewayError>> {
    return this.api.send('DELETE', HOUSEHOLD_ROUTE.household)
  }

  setDaySharing(sharesDays: boolean): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    return this.household('PUT', HOUSEHOLD_ROUTE.sharing, { sharesDays })
  }

  async receivedInvitations(): Promise<Result<readonly ReceivedInvitationView[], HouseholdGatewayError>> {
    const response = await this.api.request('GET', HOUSEHOLD_ROUTE.received, receivedInvitationsResponseSchema)
    return map(response, ({ invitations }) =>
      invitations.map((invitation) => ({
        id: idFrom<'InvitationId'>(invitation.id),
        householdName: invitation.householdName,
        invitedBy: invitation.invitedBy,
        expiresAt: new Date(invitation.expiresAt),
      })),
    )
  }

  accept(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    return this.household('POST', HOUSEHOLD_ROUTE.accept(invitationId))
  }

  decline(invitationId: InvitationId): Promise<Result<void, HouseholdGatewayError>> {
    return this.api.send('POST', HOUSEHOLD_ROUTE.decline(invitationId))
  }

  /** Appel qui doit aboutir à un foyer : une réponse sans foyer est anormale. */
  private async household(
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<Result<HouseholdView, HouseholdGatewayError>> {
    const response = await this.api.request(method, path, householdResponseSchema, body)
    if (!response.ok) return response
    return response.value.household === null
      ? err(new ExternalPayloadInvalidError('le serveur de l’application'))
      : ok(toView(response.value.household))
  }
}

function toView(payload: HouseholdPayload): HouseholdView {
  return {
    id: idFrom<'HouseholdId'>(payload.id),
    name: payload.name,
    role: payload.role,
    sharesDays: payload.sharesDays,
    members: payload.members.map((member) => ({
      accountId: idFrom<'AccountId'>(member.accountId),
      email: member.email,
      isOwner: member.isOwner,
      joinedAt: new Date(member.joinedAt),
      sharesDays: member.sharesDays,
    })),
    invitations: payload.invitations.map((invitation) => ({
      id: idFrom<'InvitationId'>(invitation.id),
      email: invitation.email,
      expiresAt: new Date(invitation.expiresAt),
    })),
  }
}
