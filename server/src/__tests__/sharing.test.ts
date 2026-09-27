import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { signedInClient, type TestClient, type TestServer, startTestServer } from './testServer'

let server: TestServer
let camille: TestClient
let alex: TestClient
let sacha: TestClient

beforeEach(async () => {
  server = await startTestServer()
  camille = await signedInClient(server, 'camille@example.fr', 'player-camille')
  alex = await signedInClient(server, 'alex@example.fr', 'player-alex')
  sacha = await signedInClient(server, 'sacha@example.fr', 'player-sacha')
})

afterEach(async () => {
  await server.close()
})

/** Camille fonde « Les Martin » et Alex y entre. Sacha reste dehors. */
async function household() {
  await camille.request('POST', '/household', { name: 'Les Martin' })
  await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
  const [invitation] = (await alex.request('GET', '/invitations')).json().invitations
  await alex.request('POST', `/invitations/${invitation.id}/accept`)
}

const push = (client: TestClient, changes: unknown[]) =>
  client.request('POST', '/sync/push', { changes })

const pulledIds = async (client: TestClient) =>
  (await client.request('GET', '/sync/pull?since=0')).json().changes.map(
    (change: { entity: string; id: string }) => `${change.entity}:${change.id}`,
  )

const food = (id: string, ownerId: string) => ({
  op: 'upsert',
  entity: 'food',
  id,
  payload: { id, ownerId, source: 'USER', name: id },
})

const needs = (playerId: string, name: string, targetCalories: number) => ({
  op: 'upsert',
  entity: 'needs',
  id: playerId,
  payload: { id: playerId, playerId, name, targetCalories },
})

const meal = (id: string, playerId: string, extra: Record<string, unknown> = {}) => ({
  op: 'upsert',
  entity: 'meal',
  id,
  payload: {
    id,
    playerId,
    dayKey: '2026-09-24',
    loggedAt: '2026-09-24T08:00:00.000Z',
    consumedAt: null,
    entries: [],
    ...extra,
  },
})

describe('Aliments perso du foyer', () => {
  it('parviennent aux autres membres, et à eux seuls', async () => {
    await household()
    await push(camille, [food('food-camille', 'player-camille')])
    await push(sacha, [food('food-sacha', 'player-sacha')])

    expect(await pulledIds(alex)).toEqual(['food:food-camille'])
    expect(await pulledIds(camille)).toEqual(['food:food-camille'])
    expect(await pulledIds(sacha)).toEqual(['food:food-sacha'])
  })

  it('arrivent aussi quand ils ont été créés avant l’entrée dans le foyer', async () => {
    await push(camille, [food('food-ancien', 'player-camille')])
    await household()

    expect(await pulledIds(alex)).toContain('food:food-ancien')
  })

  it('ne se modifient que par leur auteur', async () => {
    await household()
    await push(camille, [food('food-camille', 'player-camille')])

    const response = await push(alex, [food('food-camille', 'player-alex')])

    expect(response.json().rejected).toEqual([{ entity: 'food', id: 'food-camille', code: 'NOT_OWNER' }])
  })

  it('cessent de parvenir après un départ', async () => {
    await household()
    await alex.request('POST', '/household/leave')
    await push(camille, [food('food-camille', 'player-camille')])

    expect(await pulledIds(alex)).toEqual([])
  })

  it('ne font jamais voyager les repas ni le profil des autres', async () => {
    await household()
    await push(camille, [
      { op: 'upsert', entity: 'player', id: 'player-camille', payload: { id: 'player-camille', weightKg: 60 } },
      meal('meal-camille', 'player-camille'),
      needs('player-camille', 'Camille', 2000),
    ])

    expect(await pulledIds(alex)).toEqual([])
  })
})

describe('Besoins publiés', () => {
  it('donnent aux membres le nom et le besoin calorique, jamais les mensurations', async () => {
    await household()
    await push(camille, [needs('player-camille', 'Camille', 2000)])

    const members = (await alex.request('GET', '/household')).json().household.members
    expect(members[0]).toMatchObject({ playerId: 'player-camille', name: 'Camille', targetCalories: 2000 })
    expect(members[1]).toMatchObject({ playerId: 'player-alex', name: null, targetCalories: null })
  })

  it('ne se publient que pour son propre profil, et ne se suppriment pas', async () => {
    const response = await push(alex, [
      needs('player-camille', 'Pirate', 1),
      { op: 'delete', entity: 'needs', id: 'player-alex' },
    ])

    expect(response.json().rejected.map((rejection: { code: string }) => rejection.code)).toEqual([
      'NOT_OWNER',
      'PROFILE_NOT_DELETABLE',
    ])
  })
})

describe('Repas prévu pour un autre membre', () => {
  it('est créé chez le membre, qui le reçoit', async () => {
    await household()
    const response = await push(camille, [meal('meal-pour-alex', 'player-alex', { plannedBy: 'player-camille' })])

    expect(response.json().rejected).toEqual([])
    expect(await pulledIds(alex)).toEqual(['meal:meal-pour-alex'])
    expect(await pulledIds(camille)).toEqual([])
  })

  it('appartient ensuite au membre, qui peut le modifier', async () => {
    await household()
    await push(camille, [meal('meal-pour-alex', 'player-alex', { plannedBy: 'player-camille' })])

    const edit = await push(alex, [
      meal('meal-pour-alex', 'player-alex', { plannedBy: 'player-camille', consumedAt: '2026-09-24T12:00:00.000Z' }),
    ])
    const again = await push(camille, [meal('meal-pour-alex', 'player-alex', { plannedBy: 'player-camille' })])

    expect(edit.json().rejected).toEqual([])
    expect(again.json().rejected).toEqual([{ entity: 'meal', id: 'meal-pour-alex', code: 'NOT_OWNER' }])
  })

  it('est refusé hors du foyer, déjà pris, ou non signé', async () => {
    await household()
    const response = await push(camille, [
      meal('pour-sacha', 'player-sacha', { plannedBy: 'player-camille' }),
      meal('deja-pris', 'player-alex', { plannedBy: 'player-camille', consumedAt: '2026-09-24T12:00:00.000Z' }),
      meal('non-signe', 'player-alex'),
      meal('mal-signe', 'player-alex', { plannedBy: 'player-sacha' }),
    ])

    expect(response.json().rejected.map((rejection: { id: string }) => rejection.id)).toEqual([
      'pour-sacha',
      'deja-pris',
      'non-signe',
      'mal-signe',
    ])
    expect(await pulledIds(alex)).toEqual([])
  })

  it('n’écrase jamais un repas existant du membre', async () => {
    await household()
    await push(alex, [meal('meal-alex', 'player-alex', { note: 'le mien' })])

    const response = await push(camille, [meal('meal-alex', 'player-alex', { plannedBy: 'player-camille' })])

    expect(response.json().rejected).toEqual([{ entity: 'meal', id: 'meal-alex', code: 'NOT_OWNER' }])
    const [stored] = (await alex.request('GET', '/sync/pull?since=0')).json().changes
    expect(stored.payload.note).toBe('le mien')
  })
})

describe('Journées d’un membre', () => {
  const days = (client: TestClient, playerId: string, from = '2026-09-17', to = '2026-09-24') =>
    client.request('GET', `/household/members/${playerId}/days?from=${from}&to=${to}`)

  beforeEach(async () => {
    await household()
    await push(alex, [
      meal('ancien', 'player-alex', { dayKey: '2026-09-10' }),
      meal('mardi', 'player-alex', { dayKey: '2026-09-22' }),
      meal('jeudi', 'player-alex', { dayKey: '2026-09-24' }),
      needs('player-alex', 'Alex', 2400),
    ])
  })

  it('renvoie les repas de la période et les besoins publiés', async () => {
    const response = await days(camille, 'player-alex')

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.meals.map((record: { id: string }) => record.id)).toEqual(['mardi', 'jeudi'])
    expect(body.needs).toMatchObject({ name: 'Alex', targetCalories: 2400 })
  })

  it('ne renvoie pas les repas supprimés', async () => {
    await push(alex, [{ op: 'delete', entity: 'meal', id: 'mardi' }])
    const body = (await days(camille, 'player-alex')).json()
    expect(body.meals.map((record: { id: string }) => record.id)).toEqual(['jeudi'])
  })

  it('est refusée quand le membre ne partage pas ses journées', async () => {
    await alex.request('PUT', '/household/sharing', { sharesDays: false })

    const response = await days(camille, 'player-alex')
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('DAYS_NOT_SHARED')
    // Ses propres journées restent lisibles par soi-même.
    expect((await days(alex, 'player-alex')).statusCode).toBe(200)
  })

  it('est réservée aux membres du même foyer', async () => {
    await push(sacha, [meal('meal-sacha', 'player-sacha')])

    expect((await days(camille, 'player-sacha')).statusCode).toBe(404)
    expect((await days(sacha, 'player-alex')).json().error.code).toBe('NO_HOUSEHOLD')
  })

  it.each([
    ['2026-09-24', '2026-09-17'],
    ['2026-08-01', '2026-09-24'],
    ['24/09/2026', '2026-09-24'],
  ])('refuse la plage %s → %s', async (from, to) => {
    expect((await days(camille, 'player-alex', from, to)).statusCode).toBe(400)
  })
})
