/**
 * Façade publique de `household`.
 *
 * Les autres contextes n'en voient que les vues — qui est dans mon foyer, qui
 * partage ses journées — et les use cases. L'agrégat reste l'affaire du
 * serveur, qui fait autorité.
 */
export type {
  HouseholdMemberView,
  HouseholdRole,
  HouseholdView,
  PendingInvitationView,
  ReceivedInvitationView,
} from '../domain/views'
export { HOUSEHOLD_NAME_MAX_LENGTH, MAX_MEMBERS } from '../domain/policies'
export {
  AcceptInvitationUseCase,
  CreateHouseholdUseCase,
  DeclineInvitationUseCase,
  DissolveHouseholdUseCase,
  GetHouseholdUseCase,
  type HouseholdError,
  InviteToHouseholdUseCase,
  LeaveHouseholdUseCase,
  ListReceivedInvitationsUseCase,
  RemoveMemberUseCase,
  RevokeInvitationUseCase,
  SetDaySharingUseCase,
} from './useCases'
