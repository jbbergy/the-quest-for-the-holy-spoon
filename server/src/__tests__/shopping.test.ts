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

/** Camille fonde « Les Martin » et Alex y entre. Sacha reste dehors. Renvoie le foyer. */
async function household(): Promise<string> {
  const created = await camille.request('POST', '/household', { name: 'Les Martin' })
  await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
  const [invitation] = (await alex.request('GET', '/invitations')).json().invitations
  await alex.request('POST', `/invitations/${invitation.id}/accept`)
  return created.json().household.id
}

const push = async (client: TestClient, changes: unknown[]) =>
  (await client.request('POST', '/sync/push', { changes })).json().rejected

const pulled = async (client: TestClient) =>
  (await client.request('GET', '/sync/pull?since=0')).json().changes.filter(
    (change: { entity: string }) => change.entity === 'shopping',
  )

const item = (id: string, householdId: string | null, playerId: string, extra: Record<string, unknown> = {}) => ({
  op: 'upsert',
  entity: 'shopping',
  id,
  payload: {
    id,
    listKey: householdId ?? playerId,
    householdId,
    playerId,
    week: '2026-09-28',
    name: id,
    foodItemId: null,
    unit: { label: 'g', grams: 1, countable: false, approximate: false },
    contributions: {},
    checked: false,
    ...extra,
  },
})

describe('Liste de courses du foyer', () => {
  it('parvient à tous les membres, et à eux seuls', async () => {
    const foyer = await household()

    expect(await push(camille, [item('pain', foyer, 'player-camille')])).toEqual([])

    expect((await pulled(alex)).map((change: { id: string }) => change.id)).toEqual(['pain'])
    expect(await pulled(sacha)).toEqual([])
  })

  it('se coche et se retire par n’importe quel membre', async () => {
    const foyer = await household()
    await push(camille, [item('pain', foyer, 'player-camille')])

    expect(await push(alex, [item('pain', foyer, 'player-camille', { checked: true })])).toEqual([])
    const [checked] = await pulled(camille)
    expect(checked.payload.checked).toBe(true)

    expect(await push(alex, [{ op: 'delete', entity: 'shopping', id: 'pain' }])).toEqual([])
    const [deleted] = await pulled(camille)
    expect(deleted).toMatchObject({ id: 'pain', deleted: true })

    // Supprimer ce qui l'est déjà n'est pas un refus, et le recréer le fait revenir.
    expect(await push(camille, [{ op: 'delete', entity: 'shopping', id: 'pain' }])).toEqual([])
    expect(await push(camille, [item('pain', foyer, 'player-camille')])).toEqual([])
    expect((await pulled(alex))[0]).toMatchObject({ deleted: false })
  })

  it('reste fermée à qui n’est pas du foyer', async () => {
    const foyer = await household()
    await push(camille, [item('pain', foyer, 'player-camille')])

    const rejected = await push(sacha, [
      item('pain', foyer, 'player-sacha', { checked: true }),
      item('intrus', foyer, 'player-sacha'),
      { op: 'delete', entity: 'shopping', id: 'pain' },
    ])

    expect(rejected.map((change: { id: string; code: string }) => [change.id, change.code])).toEqual([
      ['pain', 'NOT_OWNER'],
      ['intrus', 'NOT_OWNER'],
      ['pain', 'NOT_OWNER'],
    ])
    const [kept] = await pulled(alex)
    expect(kept.payload.checked).toBe(false)
  })

  it('n’est plus lue ni écrite par un membre qui part', async () => {
    const foyer = await household()
    await push(alex, [item('lait', foyer, 'player-alex')])
    await alex.request('POST', '/household/leave')

    expect(await pulled(alex)).toEqual([])
    expect(await push(alex, [item('lait', foyer, 'player-alex', { checked: true })])).toEqual([
      { entity: 'shopping', id: 'lait', code: 'NOT_OWNER' },
    ])
    // Ce qu'Alex a ajouté reste dans la liste du foyer.
    expect((await pulled(camille)).map((change: { id: string }) => change.id)).toEqual(['lait'])
  })

  it('disparaît avec le foyer', async () => {
    const foyer = await household()
    await push(camille, [item('pain', foyer, 'player-camille')])

    await camille.request('DELETE', '/household')

    expect(await pulled(camille)).toEqual([])
    expect(await pulled(alex)).toEqual([])
  })
})

describe('Liste de courses personnelle', () => {
  it('ne se lit et ne s’écrit que par son titulaire', async () => {
    await household()

    expect(await push(camille, [item('chocolat', null, 'player-camille')])).toEqual([])
    expect(await push(alex, [item('chocolat', null, 'player-camille', { checked: true })])).toEqual([
      { entity: 'shopping', id: 'chocolat', code: 'NOT_OWNER' },
    ])
    expect(await push(alex, [{ op: 'delete', entity: 'shopping', id: 'chocolat' }])).toEqual([
      { entity: 'shopping', id: 'chocolat', code: 'NOT_OWNER' },
    ])

    expect((await pulled(camille)).map((change: { id: string }) => change.id)).toEqual(['chocolat'])
    expect(await pulled(alex)).toEqual([])
  })

  it('ne devient pas la liste du foyer en changeant de foyer', async () => {
    const foyer = await household()
    await push(camille, [item('chocolat', null, 'player-camille')])

    expect(await push(camille, [item('chocolat', foyer, 'player-camille')])).toEqual([
      { entity: 'shopping', id: 'chocolat', code: 'NOT_OWNER' },
    ])
  })
})
