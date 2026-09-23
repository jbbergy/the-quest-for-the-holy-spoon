import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { RemoteRejectedError, ServerUnreachableError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'

import type { HouseholdView, ReceivedInvitationView } from '../../application'
import { useHouseholdStore } from '../useHouseholdStore'

const household: HouseholdView = {
  id: idFrom('household-1'),
  name: 'Les Martin',
  role: 'owner',
  sharesDays: true,
  members: [],
  invitations: [],
}

const invitation: ReceivedInvitationView = {
  id: idFrom('invitation-1'),
  householdName: 'Chez Sacha',
  invitedBy: 'sacha@example.fr',
  expiresAt: new Date('2026-10-08T10:00:00Z'),
}

const rejected = (code: string) => failsWith(new RemoteRejectedError(code, code, 409))

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useHouseholdStore', () => {
  it('charge le foyer et les invitations reçues', async () => {
    provideContainer(
      createFakeContainer({
        household: { get: succeedsWith(household), receivedInvitations: succeedsWith([invitation]) },
      }),
    )
    const store = useHouseholdStore()

    expect(await store.load()).toBe(true)
    expect(store.household).toEqual(household)
    expect(store.invitations).toEqual([invitation])
    expect(store.isOwner).toBe(true)
    expect(store.loaded).toBe(true)
  })

  it('signale un serveur injoignable au chargement', async () => {
    provideContainer(
      createFakeContainer({ household: { get: failsWith(new ServerUnreachableError('hors ligne')) } }),
    )
    const store = useHouseholdStore()

    expect(await store.load()).toBe(false)
    expect(store.status).toBe('unreachable')
    expect(store.loaded).toBe(false)
  })

  it('signale un autre refus au chargement', async () => {
    provideContainer(
      createFakeContainer({ household: { receivedInvitations: rejected('EMAIL_NOT_VERIFIED') } }),
    )
    const store = useHouseholdStore()

    expect(await store.load()).toBe(false)
    expect(store.status).toBe('error')
    expect(store.error?.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('garde la vue renvoyée par le serveur après une modification', async () => {
    const updated = { ...household, sharesDays: false }
    provideContainer(createFakeContainer({ household: { setDaySharing: succeedsWith(updated) } }))
    const store = useHouseholdStore()

    expect(await store.setDaySharing(false)).toBe(true)
    expect(store.household).toEqual(updated)
  })

  it.each(['create', 'revoke', 'removeMember'] as const)('%s met le foyer à jour', async (action) => {
    provideContainer(createFakeContainer({ household: { [action]: succeedsWith(household) } }))
    const store = useHouseholdStore()

    const run = store[action] as (arg: never) => Promise<boolean>
    expect(await run('x' as never)).toBe(true)
    expect(store.household).toEqual(household)
  })

  it('relit le foyer après une invitation, dont la réponse est muette', async () => {
    const withPending = {
      ...household,
      invitations: [{ id: idFrom<'InvitationId'>('i-1'), email: 'alex@example.fr', expiresAt: new Date() }],
    }
    provideContainer(createFakeContainer({ household: { get: succeedsWith(withPending) } }))
    const store = useHouseholdStore()

    expect(await store.invite('alex@example.fr')).toBe(true)
    expect(store.household?.invitations).toHaveLength(1)
  })

  it('expose le refus d’une invitation', async () => {
    provideContainer(createFakeContainer({ household: { invite: rejected('ALREADY_INVITED') } }))
    const store = useHouseholdStore()

    expect(await store.invite('alex@example.fr')).toBe(false)
    expect(store.error?.code).toBe('ALREADY_INVITED')
  })

  it('relit le foyer après un conflit', async () => {
    const get = vi.fn(async () => ok(household))
    provideContainer(
      createFakeContainer({
        household: { get: { execute: get }, revoke: rejected('HOUSEHOLD_CONFLICT') },
      }),
    )
    const store = useHouseholdStore()

    expect(await store.revoke(idFrom('invitation-1'))).toBe(false)
    await vi.waitFor(() => expect(store.household).toEqual(household))
    expect(store.error?.code).toBe('HOUSEHOLD_CONFLICT')
  })

  it('accepter fait entrer dans le foyer et retire l’invitation', async () => {
    provideContainer(
      createFakeContainer({
        household: { receivedInvitations: succeedsWith([invitation]), accept: succeedsWith(household) },
      }),
    )
    const store = useHouseholdStore()
    await store.load()

    expect(await store.accept(invitation.id)).toBe(true)
    expect(store.household).toEqual(household)
    expect(store.invitations).toEqual([])
  })

  it('refuser retire l’invitation', async () => {
    provideContainer(createFakeContainer({ household: { receivedInvitations: succeedsWith([invitation]) } }))
    const store = useHouseholdStore()
    await store.load()

    expect(await store.decline(invitation.id)).toBe(true)
    expect(store.invitations).toEqual([])
  })

  it.each(['accept', 'decline'] as const)('%s expose un refus', async (action) => {
    provideContainer(createFakeContainer({ household: { [action]: rejected('INVITATION_NOT_FOUND') } }))
    const store = useHouseholdStore()

    expect(await store[action](invitation.id)).toBe(false)
    expect(store.error?.code).toBe('INVITATION_NOT_FOUND')
  })

  it.each(['leave', 'dissolve'] as const)('%s rend seul, et relit les invitations', async (action) => {
    provideContainer(
      createFakeContainer({
        household: { get: succeedsWith(household), receivedInvitations: succeedsWith([invitation]) },
      }),
    )
    const store = useHouseholdStore()
    await store.load()

    expect(await store[action]()).toBe(true)
    expect(store.household).toBeNull()
    expect(store.invitations).toEqual([invitation])
  })

  it('garde le foyer si le départ est refusé', async () => {
    provideContainer(
      createFakeContainer({
        household: { get: succeedsWith(household), leave: rejected('OWNER_CANNOT_LEAVE') },
      }),
    )
    const store = useHouseholdStore()
    await store.load()

    expect(await store.leave()).toBe(false)
    expect(store.household).toEqual(household)
    expect(store.error?.code).toBe('OWNER_CANNOT_LEAVE')
  })

  it('oublie tout à la déconnexion', async () => {
    provideContainer(
      createFakeContainer({
        household: { get: succeedsWith(household), receivedInvitations: succeedsWith([invitation]) },
      }),
    )
    const store = useHouseholdStore()
    await store.load()

    store.reset()

    expect(store.household).toBeNull()
    expect(store.invitations).toEqual([])
    expect(store.status).toBe('idle')
    expect(store.loaded).toBe(false)
  })

  it('efface une erreur affichée', async () => {
    provideContainer(createFakeContainer({ household: { create: rejected('ALREADY_IN_HOUSEHOLD') } }))
    const store = useHouseholdStore()
    await store.create('Autre')

    store.clearError()

    expect(store.error).toBeNull()
    expect(store.status).toBe('ready')
  })
})
