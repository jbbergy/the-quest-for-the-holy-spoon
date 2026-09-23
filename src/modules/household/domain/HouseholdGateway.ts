import type { Email } from '@/core/Email'
import type { RemoteError, ValidationError } from '@/core/errors'
import type { AccountId, InvitationId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { HouseholdView, ReceivedInvitationView } from './views'

export type HouseholdGatewayError = RemoteError | ValidationError

/**
 * Port du client vers le service des foyers.
 *
 * Le foyer n'est pas répliqué sur l'appareil : il n'existe qu'en ligne, et le
 * serveur, qui fait autorité, renvoie après chaque changement la vue à jour.
 */
export interface IHouseholdGateway {
  current(): Promise<Result<HouseholdView | null, HouseholdGatewayError>>
  create(name: string): Promise<Result<HouseholdView, HouseholdGatewayError>>
  invite(email: Email): Promise<Result<void, HouseholdGatewayError>>
  revoke(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdGatewayError>>
  removeMember(accountId: AccountId): Promise<Result<HouseholdView, HouseholdGatewayError>>
  leave(): Promise<Result<void, HouseholdGatewayError>>
  dissolve(): Promise<Result<void, HouseholdGatewayError>>
  setDaySharing(sharesDays: boolean): Promise<Result<HouseholdView, HouseholdGatewayError>>

  receivedInvitations(): Promise<Result<readonly ReceivedInvitationView[], HouseholdGatewayError>>
  accept(invitationId: InvitationId): Promise<Result<HouseholdView, HouseholdGatewayError>>
  decline(invitationId: InvitationId): Promise<Result<void, HouseholdGatewayError>>
}
