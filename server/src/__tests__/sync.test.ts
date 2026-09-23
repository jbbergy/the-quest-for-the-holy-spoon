import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { signedInClient, type TestClient, type TestServer, startTestServer } from './testServer'

let server: TestServer
let camille: TestClient

const meal = (id: string, playerId = 'player-camille', extra: Record<string, unknown> = {}) => ({
  op: 'upsert',
  entity: 'meal',
  id,
  payload: { id, playerId, dayKey: '2026-09-23', entries: [], ...extra },
})

beforeEach(async () => {
  server = await startTestServer()
  camille = await signedInClient(server, 'camille@example.fr', 'player-camille')
})

afterEach(async () => {
  await server.close()
})

const pull = async (client: TestClient, since = 0) =>
  (await client.request('GET', `/sync/pull?since=${since}`)).json()

describe('Synchronisation', () => {
  it('renvoie à un autre appareil ce qu’un premier a envoyé', async () => {
    const push = await camille.request('POST', '/sync/push', {
      changes: [
        { op: 'upsert', entity: 'player', id: 'player-camille', payload: { id: 'player-camille', name: 'Camille' } },
        meal('meal-1'),
      ],
    })
    expect(push.json()).toEqual({ rejected: [] })

    const page = await pull(camille)
    expect(page.hasMore).toBe(false)
    expect(page.changes.map((change: { id: string }) => change.id)).toEqual(['player-camille', 'meal-1'])
    expect(page.changes[1]).toMatchObject({ deleted: false, payload: { playerId: 'player-camille' } })
  })

  it('ne renvoie que ce qui a changé depuis le curseur', async () => {
    await camille.request('POST', '/sync/push', { changes: [meal('meal-1')] })
    const first = await pull(camille)
    await camille.request('POST', '/sync/push', { changes: [meal('meal-2')] })

    const next = await pull(camille, first.revision)
    expect(next.changes.map((change: { id: string }) => change.id)).toEqual(['meal-2'])
    expect(next.revision).toBeGreaterThan(first.revision)
    expect((await pull(camille, next.revision)).changes).toEqual([])
  })

  it('garde la dernière version reçue', async () => {
    await camille.request('POST', '/sync/push', { changes: [meal('meal-1', 'player-camille', { note: 'a' })] })
    await camille.request('POST', '/sync/push', { changes: [meal('meal-1', 'player-camille', { note: 'b' })] })

    const page = await pull(camille)
    expect(page.changes).toHaveLength(1)
    expect(page.changes[0].payload.note).toBe('b')
  })

  it('propage une suppression', async () => {
    await camille.request('POST', '/sync/push', { changes: [meal('meal-1')] })
    const before = await pull(camille)
    await camille.request('POST', '/sync/push', {
      changes: [{ op: 'delete', entity: 'meal', id: 'meal-1' }],
    })

    const page = await pull(camille, before.revision)
    expect(page.changes).toEqual([
      { entity: 'meal', id: 'meal-1', deleted: true, revision: expect.any(Number) },
    ])
  })

  it('accepte la suppression d’un enregistrement jamais envoyé', async () => {
    const push = await camille.request('POST', '/sync/push', {
      changes: [{ op: 'delete', entity: 'meal', id: 'jamais-vu' }],
    })

    expect(push.json()).toEqual({ rejected: [] })
    expect((await pull(camille)).changes).toEqual([])
  })

  it('pagine une longue absence', async () => {
    const changes = Array.from({ length: 100 }, (_, index) => meal(`meal-${index}`))
    for (let round = 0; round < 6; round += 1) {
      await camille.request('POST', '/sync/push', {
        changes: changes.map((change) => ({ ...change, id: `${change.id}-${round}`, payload: { ...change.payload, id: `${change.id}-${round}` } })),
      })
    }

    const first = await pull(camille)
    expect(first.changes).toHaveLength(500)
    expect(first.hasMore).toBe(true)
    const second = await pull(camille, first.revision)
    expect(second.changes).toHaveLength(100)
    expect(second.hasMore).toBe(false)
  })
})

describe('Propriété des enregistrements', () => {
  let alex: TestClient

  beforeEach(async () => {
    alex = await signedInClient(server, 'alex@example.fr', 'player-alex')
    await camille.request('POST', '/sync/push', { changes: [meal('meal-camille')] })
  })

  it('ne montre à un compte que ses propres données', async () => {
    expect((await pull(alex)).changes).toEqual([])
  })

  it('refuse un repas attribué à un autre profil', async () => {
    const push = await alex.request('POST', '/sync/push', {
      changes: [meal('meal-alex', 'player-camille'), meal('meal-alex-2', 'player-alex')],
    })

    // Le refus de l'un n'empêche pas l'autre de passer.
    expect(push.json()).toEqual({
      rejected: [{ entity: 'meal', id: 'meal-alex', code: 'NOT_OWNER' }],
    })
    expect((await pull(alex)).changes.map((change: { id: string }) => change.id)).toEqual(['meal-alex-2'])
  })

  it('refuse d’écraser ou de supprimer l’enregistrement d’un autre compte', async () => {
    const overwrite = await alex.request('POST', '/sync/push', {
      changes: [meal('meal-camille', 'player-alex')],
    })
    const remove = await alex.request('POST', '/sync/push', {
      changes: [{ op: 'delete', entity: 'meal', id: 'meal-camille' }],
    })

    expect(overwrite.json().rejected).toEqual([{ entity: 'meal', id: 'meal-camille', code: 'NOT_OWNER' }])
    expect(remove.json().rejected).toEqual([{ entity: 'meal', id: 'meal-camille', code: 'NOT_OWNER' }])
    expect((await pull(camille)).changes[0]).toMatchObject({ deleted: false, payload: { playerId: 'player-camille' } })
  })

  it('refuse le profil d’un autre et la suppression d’un profil', async () => {
    const push = await alex.request('POST', '/sync/push', {
      changes: [
        { op: 'upsert', entity: 'player', id: 'player-camille', payload: { id: 'player-camille' } },
        { op: 'delete', entity: 'player', id: 'player-alex' },
      ],
    })

    expect(push.json().rejected.map((rejection: { code: string }) => rejection.code)).toEqual([
      'NOT_OWNER',
      'PROFILE_NOT_DELETABLE',
    ])
  })

  it('refuse un contenu incohérent et un aliment qui n’est pas personnel', async () => {
    const push = await alex.request('POST', '/sync/push', {
      changes: [
        { op: 'upsert', entity: 'meal', id: 'meal-x', payload: { id: 'autre', playerId: 'player-alex' } },
        { op: 'upsert', entity: 'food', id: 'ciqual:1', payload: { id: 'ciqual:1', source: 'CIQUAL' } },
        { op: 'upsert', entity: 'food', id: 'food-1', payload: { id: 'food-1', source: 'USER' } },
      ],
    })

    expect(push.json().rejected.map((rejection: { id: string }) => rejection.id)).toEqual([
      'meal-x',
      'ciqual:1',
    ])
  })
})

describe('Accès', () => {
  it('exige une session', async () => {
    const anonymous = await server.app.inject({ method: 'GET', url: '/api/sync/pull' })
    expect(anonymous.statusCode).toBe(401)
  })

  it('exige un profil rattaché pour envoyer', async () => {
    const newcomer = await signedInClient(server, 'nouveau@example.fr', 'player-x')
    await newcomer.request('DELETE', '/auth/account', { password: 'cuillère en bois dorée' })
    const fresh = await signedInClient(server, 'sans-profil@example.fr', '')

    const push = await fresh.request('POST', '/sync/push', { changes: [] })
    expect(push.statusCode).toBe(409)
    expect(push.json()).toMatchObject({ error: { code: 'NO_PROFILE_LINKED' } })
  })

  it('efface les données avec le compte', async () => {
    await camille.request('POST', '/sync/push', { changes: [meal('meal-1')] })
    await camille.request('DELETE', '/auth/account', { password: 'cuillère en bois dorée' })

    const count = await server.db.selectFrom('records').select(server.db.fn.countAll().as('n')).executeTakeFirstOrThrow()
    expect(Number(count.n)).toBe(0)
  })
})
