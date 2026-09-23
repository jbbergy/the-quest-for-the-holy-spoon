import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiClient } from '@/contract/apiClient'
import type { SyncEntity } from '@/core/infrastructure/changeJournal'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'

import {
  signedInClient,
  type TestClient,
  type TestServer,
  startTestServer,
} from '../../../../server/src/__tests__/testServer'
import { HttpSyncGateway } from '../HttpSyncGateway'
import { SyncEngine } from '../SyncEngine'

import { createDevice, type Device, mealOf, playerOf, unwrap } from './fixtures'

/**
 * Deux appareils, un serveur — de bout en bout.
 *
 * Chaque appareil a sa propre base IndexedDB et son propre moteur ; ils ne
 * communiquent que par l'API réelle, montée sur une base PGlite en mémoire.
 * Aucun faux : c'est le chemin que prennent les données en production, au
 * transport HTTP près.
 */
const PLAYER = 'player-camille'

class SwitchableNetwork implements INetworkStatus {
  online = true
  isOnline(): boolean {
    return this.online
  }
  subscribe(): () => void {
    return () => undefined
  }
}

/** `fetch` qui passe par l'API en mémoire, avec la session du client donné. */
function fetchThrough(client: TestClient, network: SwitchableNetwork): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!network.online) throw new TypeError('NetworkError when attempting to fetch resource.')
    const url = String(input).replace(/^\/api/, '')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE'
    const response = await client.request(method, url, body)
    return new Response(response.statusCode === 204 ? null : response.body, {
      status: response.statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

interface Phone extends Device {
  readonly engine: SyncEngine
  readonly network: SwitchableNetwork
  readonly remote: SyncEntity[][]
}

function phone(client: TestClient): Phone {
  const device = createDevice()
  const network = new SwitchableNetwork()
  const engine = new SyncEngine(
    device.replica,
    new HttpSyncGateway(new ApiClient(fetchThrough(client, network))),
    network,
  )
  const remote: SyncEntity[][] = []
  engine.onRemoteChanges((entities) => remote.push([...entities]))
  return { ...device, engine, network, remote }
}

let server: TestServer
let client: TestClient
let laptop: Phone
let mobile: Phone
const session = { accountId: '', playerId: PLAYER }

beforeEach(async () => {
  server = await startTestServer()
  client = await signedInClient(server, 'camille@example.fr', PLAYER)
  const account = (await client.request('GET', '/auth/session')).json().account
  session.accountId = account.id

  // Deux navigateurs connectés au même compte : même session, bases distinctes.
  laptop = phone(client)
  mobile = phone(client)

  unwrap(await laptop.players.save(playerOf(PLAYER)))
  unwrap(await laptop.meals.save(mealOf(PLAYER, 100, 'meal-1')))
})

afterEach(async () => {
  await server.close()
})

describe('Deux appareils, un compte', () => {
  it('envoie les données du premier appareil et les télécharge sur le second', async () => {
    expect(unwrap(await laptop.engine.connect(session, PLAYER))).toBe('uploaded')
    expect(laptop.engine.status).toMatchObject({ phase: 'idle', pending: 0 })

    expect(unwrap(await mobile.engine.connect(session, null))).toBe('downloaded')

    expect(unwrap(await mobile.players.findCurrent())?.id).toBe(PLAYER)
    expect(unwrap(await mobile.meals.findAllByPlayer(playerOf(PLAYER).id))).toHaveLength(1)
  })

  it('garde hors ligne ce qui est modifié, et l’envoie au retour du réseau', async () => {
    await laptop.engine.connect(session, PLAYER)
    await mobile.engine.connect(session, null)

    mobile.network.online = false
    unwrap(await mobile.meals.save(mealOf(PLAYER, 150, 'meal-2')))
    await mobile.engine.sync()
    expect(mobile.engine.status).toMatchObject({ phase: 'offline', pending: 1 })

    mobile.network.online = true
    await mobile.engine.sync()
    expect(mobile.engine.status).toMatchObject({ phase: 'idle', pending: 0 })

    await laptop.engine.sync()
    expect(unwrap(await laptop.meals.findAllByPlayer(playerOf(PLAYER).id))).toHaveLength(2)
    expect(laptop.remote).toEqual([['meal']])
  })

  it('propage une suppression', async () => {
    await laptop.engine.connect(session, PLAYER)
    await mobile.engine.connect(session, null)

    unwrap(await mobile.meals.delete(mealOf(PLAYER, 1, 'meal-1').id))
    await mobile.engine.sync()
    await laptop.engine.sync()

    expect(unwrap(await laptop.meals.findAllByPlayer(playerOf(PLAYER).id))).toEqual([])
  })

  it('laisse la dernière écriture reçue l’emporter, sans perdre la modification locale', async () => {
    await laptop.engine.connect(session, PLAYER)
    await mobile.engine.connect(session, null)

    // Les deux appareils modifient le même repas hors ligne…
    laptop.network.online = false
    unwrap(await laptop.meals.save(mealOf(PLAYER, 200, 'meal-1')))
    unwrap(await mobile.meals.save(mealOf(PLAYER, 300, 'meal-1')))
    // …le mobile envoie d'abord, l'ordinateur ensuite.
    await mobile.engine.sync()
    laptop.network.online = true
    await laptop.engine.sync()
    await mobile.engine.sync()

    const grams = async (device: Phone) =>
      unwrap(await device.meals.findById(mealOf(PLAYER, 1, 'meal-1').id))?.entries[0]?.quantity
        .grams
    expect(await grams(laptop)).toBe(200)
    expect(await grams(mobile)).toBe(200)
  })

  it('reprend là où il en était après un redémarrage', async () => {
    await laptop.engine.connect(session, PLAYER)

    const restarted = new SyncEngine(
      laptop.replica,
      new HttpSyncGateway(new ApiClient(fetchThrough(client, laptop.network))),
      laptop.network,
    )
    // Même compte, même profil : aucun renvoi massif, aucun téléchargement.
    expect(unwrap(await restarted.connect(session, PLAYER))).toBe('resumed')
  })

  it('efface la copie locale à la déconnexion, sans toucher au serveur', async () => {
    await laptop.engine.connect(session, PLAYER)
    await mobile.engine.connect(session, null)

    unwrap(await mobile.engine.disconnect({ wipe: true }))

    expect(unwrap(await mobile.players.findCurrent())).toBeNull()
    expect(mobile.engine.status.phase).toBe('off')
    expect(unwrap(await laptop.meals.findAllByPlayer(playerOf(PLAYER).id))).toHaveLength(1)
  })

  it('signale combien de modifications restent à envoyer', async () => {
    await laptop.engine.connect(session, PLAYER)
    laptop.network.online = false
    unwrap(await laptop.meals.save(mealOf(PLAYER, 120, 'meal-3')))

    expect(await laptop.engine.flush()).toBe(1)
  })
})
