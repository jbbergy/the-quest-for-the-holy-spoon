import { describe, expect, it, vi } from 'vitest'

import { ApiClient } from '@/contract/apiClient'
import { Email } from '@/core/Email'
import { idFrom } from '@/core/identity'

import { HttpHouseholdGateway } from '../HttpHouseholdGateway'

const HOUSEHOLD = {
  id: 'b1e2c3d4-0000-4000-8000-000000000001',
  name: 'Les Martin',
  role: 'owner',
  sharesDays: true,
  members: [
    {
      accountId: 'account-camille',
      email: 'camille@example.fr',
      isOwner: true,
      joinedAt: '2026-09-24T10:00:00.000Z',
      sharesDays: true,
    },
  ],
  invitations: [
    { id: 'invitation-1', email: 'alex@example.fr', expiresAt: '2026-10-08T10:00:00.000Z' },
  ],
}

const respond = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function gatewayAnswering(response: Response) {
  const fetchFn = vi.fn(async () => response)
  const gateway = new HttpHouseholdGateway(new ApiClient(fetchFn as unknown as typeof fetch))
  const call = (): [string, RequestInit] => fetchFn.mock.calls[0] as unknown as [string, RequestInit]
  return { gateway, call }
}

describe('HttpHouseholdGateway', () => {
  it('lit le foyer, dates comprises', async () => {
    const { gateway } = gatewayAnswering(respond(200, { household: HOUSEHOLD }))

    const result = await gateway.current()

    expect(result.ok && result.value).toMatchObject({
      name: 'Les Martin',
      role: 'owner',
      members: [{ email: 'camille@example.fr', joinedAt: new Date('2026-09-24T10:00:00.000Z') }],
      invitations: [{ id: 'invitation-1', expiresAt: new Date('2026-10-08T10:00:00.000Z') }],
    })
  })

  it('distingue l’absence de foyer d’une erreur', async () => {
    const { gateway } = gatewayAnswering(respond(200, { household: null }))
    expect(await gateway.current()).toEqual({ ok: true, value: null })
  })

  it('crée un foyer et renvoie sa vue', async () => {
    const { gateway, call } = gatewayAnswering(respond(201, { household: HOUSEHOLD }))

    const result = await gateway.create('Les Martin')

    expect(result.ok && result.value.name).toBe('Les Martin')
    expect(call()[0]).toBe('/api/household')
    expect(call()[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Les Martin' }) })
  })

  it('tient pour anormale une réponse sans foyer là où il en faut un', async () => {
    const { gateway } = gatewayAnswering(respond(200, { household: null }))
    const result = await gateway.accept(idFrom('invitation-1'))
    expect(!result.ok && result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
  })

  it('envoie l’adresse normalisée et accepte la réponse muette', async () => {
    const { gateway, call } = gatewayAnswering(respond(202, { status: 'accepted' }))

    const result = await gateway.invite(Email.reconstitute('alex@example.fr'))

    expect(result).toEqual({ ok: true, value: undefined })
    expect(call()[0]).toBe('/api/household/invitations')
    expect(call()[1].body).toBe(JSON.stringify({ email: 'alex@example.fr' }))
  })

  it.each([
    ['revoke', (g: HttpHouseholdGateway) => g.revoke(idFrom('inv/1')), '/api/household/invitations/inv%2F1', 'DELETE'],
    ['removeMember', (g: HttpHouseholdGateway) => g.removeMember(idFrom('a-2')), '/api/household/members/a-2', 'DELETE'],
    ['setDaySharing', (g: HttpHouseholdGateway) => g.setDaySharing(false), '/api/household/sharing', 'PUT'],
    ['accept', (g: HttpHouseholdGateway) => g.accept(idFrom('inv-1')), '/api/invitations/inv-1/accept', 'POST'],
  ] as const)('%s appelle la bonne route', async (_name, act, url, method) => {
    const { gateway, call } = gatewayAnswering(respond(200, { household: HOUSEHOLD }))

    const result = await act(gateway)

    expect(result.ok).toBe(true)
    expect(call()[0]).toBe(url)
    expect(call()[1].method).toBe(method)
  })

  it.each([
    ['leave', (g: HttpHouseholdGateway) => g.leave(), '/api/household/leave', 'POST'],
    ['dissolve', (g: HttpHouseholdGateway) => g.dissolve(), '/api/household', 'DELETE'],
    ['decline', (g: HttpHouseholdGateway) => g.decline(idFrom('inv-1')), '/api/invitations/inv-1/decline', 'POST'],
  ] as const)('%s n’attend aucun corps en réponse', async (_name, act, url, method) => {
    const { gateway, call } = gatewayAnswering(respond(204))

    expect(await act(gateway)).toEqual({ ok: true, value: undefined })
    expect(call()[0]).toBe(url)
    expect(call()[1].method).toBe(method)
  })

  it('lit les invitations reçues', async () => {
    const { gateway } = gatewayAnswering(
      respond(200, {
        invitations: [
          {
            id: 'invitation-1',
            householdName: 'Les Martin',
            invitedBy: 'camille@example.fr',
            expiresAt: '2026-10-08T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(await gateway.receivedInvitations()).toEqual({
      ok: true,
      value: [
        {
          id: 'invitation-1',
          householdName: 'Les Martin',
          invitedBy: 'camille@example.fr',
          expiresAt: new Date('2026-10-08T10:00:00.000Z'),
        },
      ],
    })
  })

  it('transmet le refus du serveur avec son code', async () => {
    const { gateway } = gatewayAnswering(
      respond(409, { error: { code: 'ALREADY_IN_HOUSEHOLD', message: 'déjà membre' } }),
    )
    const result = await gateway.create('Autre')
    expect(!result.ok && result.error.code).toBe('ALREADY_IN_HOUSEHOLD')
  })
})
