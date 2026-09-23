import { describe, expect, it, vi } from 'vitest'

import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'

import type { IHouseholdGateway } from '../../domain/HouseholdGateway'
import {
  AcceptInvitationUseCase,
  CreateHouseholdUseCase,
  DeclineInvitationUseCase,
  DissolveHouseholdUseCase,
  GetHouseholdUseCase,
  InviteToHouseholdUseCase,
  LeaveHouseholdUseCase,
  ListReceivedInvitationsUseCase,
  RemoveMemberUseCase,
  RevokeInvitationUseCase,
  SetDaySharingUseCase,
} from '../useCases'

function fakeGateway(): IHouseholdGateway {
  const answer = vi.fn(async () => ok(null))
  return {
    current: answer,
    create: answer,
    invite: vi.fn(async () => ok(undefined)),
    revoke: answer,
    removeMember: answer,
    leave: answer,
    dissolve: answer,
    setDaySharing: answer,
    receivedInvitations: vi.fn(async () => ok([])),
    accept: answer,
    decline: answer,
  } as unknown as IHouseholdGateway
}

describe('Use cases du foyer (client)', () => {
  it('refuse un nom vide sans appeler le serveur', async () => {
    const gateway = fakeGateway()

    const result = await new CreateHouseholdUseCase(gateway).execute('   ')

    expect(!result.ok && result.error.code).toBe('INVALID_HOUSEHOLD_NAME')
    expect(gateway.create).not.toHaveBeenCalled()
  })

  it('envoie le nom sans ses espaces de bord', async () => {
    const gateway = fakeGateway()
    await new CreateHouseholdUseCase(gateway).execute('  Les Martin ')
    expect(gateway.create).toHaveBeenCalledWith('Les Martin')
  })

  it('refuse une adresse mal formée sans appeler le serveur', async () => {
    const gateway = fakeGateway()

    const result = await new InviteToHouseholdUseCase(gateway).execute('alex@')

    expect(!result.ok && result.error.code).toBe('INVALID_EMAIL')
    expect(gateway.invite).not.toHaveBeenCalled()
  })

  it('normalise l’adresse invitée', async () => {
    const gateway = fakeGateway()
    await new InviteToHouseholdUseCase(gateway).execute(' Alex@Example.FR ')
    expect(vi.mocked(gateway.invite).mock.calls[0]?.[0].value).toBe('alex@example.fr')
  })

  it('transmet les autres demandes telles quelles', async () => {
    const gateway = fakeGateway()
    const invitation = idFrom<'InvitationId'>('invitation-1')
    const member = idFrom<'AccountId'>('account-alex')

    await new GetHouseholdUseCase(gateway).execute()
    await new RevokeInvitationUseCase(gateway).execute(invitation)
    await new RemoveMemberUseCase(gateway).execute(member)
    await new LeaveHouseholdUseCase(gateway).execute()
    await new DissolveHouseholdUseCase(gateway).execute()
    await new SetDaySharingUseCase(gateway).execute(false)
    await new ListReceivedInvitationsUseCase(gateway).execute()
    await new AcceptInvitationUseCase(gateway).execute(invitation)
    await new DeclineInvitationUseCase(gateway).execute(invitation)

    expect(gateway.revoke).toHaveBeenCalledWith(invitation)
    expect(gateway.removeMember).toHaveBeenCalledWith(member)
    expect(gateway.setDaySharing).toHaveBeenCalledWith(false)
    expect(gateway.accept).toHaveBeenCalledWith(invitation)
    expect(gateway.decline).toHaveBeenCalledWith(invitation)
    expect(gateway.receivedInvitations).toHaveBeenCalled()
  })
})
