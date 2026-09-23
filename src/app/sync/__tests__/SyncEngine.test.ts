import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OutgoingChange, PullResponse } from '@/contract/sync'
import { RemoteRejectedError, ServerUnreachableError } from '@/core/errors'
import type { SyncState } from '@/core/infrastructure/changeJournal'
import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { err, ok } from '@/core/result'

import type { ILocalReplica, ISyncGateway } from '../ports'
import { SyncEngine } from '../SyncEngine'

/**
 * Le moteur seul, sur des ports en mémoire : les cas que le scénario à deux
 * appareils n'atteint pas facilement — refus du serveur, cycles concurrents,
 * téléchargement interrompu.
 */
function memoryReplica(initial: SyncState | null = null) {
  let state = initial
  let pending: OutgoingChange[] = []
  const replica: ILocalReplica = {
    state: async () => ok(state),
    start: async (next) => {
      state = next
      return ok(undefined)
    },
    enqueueAll: async () => {
      pending = [{ op: 'delete', entity: 'meal', id: 'm' }]
      return ok(undefined)
    },
    pending: async () => ok(pending.length === 0 ? null : { changes: pending, lastSeq: 1 }),
    pendingCount: async () => ok(pending.length),
    acknowledge: async () => {
      pending = []
      return ok(undefined)
    },
    applyRemote: async (_changes, cursor) => {
      if (state !== null) state = { ...state, cursor }
      return ok(new Set())
    },
    makeCurrent: async () => ok(undefined),
    stop: async () => {
      state = null
      pending = []
      return ok(undefined)
    },
  }
  return { replica, queue: (change: OutgoingChange) => pending.push(change), current: () => state }
}

const emptyPage: PullResponse = { changes: [], revision: 0, hasMore: false }
const SESSION = { accountId: 'account-1', playerId: 'player-1' }

function gateway(overrides: Partial<ISyncGateway> = {}): ISyncGateway {
  return {
    push: vi.fn(async () => ok([])),
    pull: vi.fn(async () => ok(emptyPage)),
    ...overrides,
  }
}

describe('SyncEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reste inerte sans compte connecté', async () => {
    const remote = gateway()
    const engine = new SyncEngine(memoryReplica().replica, remote, new StaticNetworkStatus(true))

    await engine.sync()
    engine.schedule()
    await vi.runAllTimersAsync()

    expect(engine.status.phase).toBe('off')
    expect(remote.push).not.toHaveBeenCalled()
  })

  it('signale un refus du serveur comme une erreur, pas comme une coupure', async () => {
    const { replica, queue } = memoryReplica({ ...SESSION, cursor: 0 })
    queue({ op: 'delete', entity: 'meal', id: 'm' })
    const engine = new SyncEngine(
      replica,
      gateway({ push: async () => err(new RemoteRejectedError('NOT_AUTHENTICATED', 'expirée', 401)) }),
      new StaticNetworkStatus(true),
    )

    await engine.sync()

    expect(engine.status).toMatchObject({ phase: 'error', pending: 1 })
    expect(engine.status.error?.code).toBe('NOT_AUTHENTICATED')
  })

  it('tient un serveur injoignable pour une coupure', async () => {
    const { replica } = memoryReplica({ ...SESSION, cursor: 0 })
    const engine = new SyncEngine(
      replica,
      gateway({ pull: async () => err(new ServerUnreachableError('absent')) }),
      new StaticNetworkStatus(true),
    )

    await engine.sync()

    expect(engine.status).toMatchObject({ phase: 'offline', error: null })
  })

  it('ne fait tourner qu’un cycle à la fois, et en relance un à la fin', async () => {
    const { replica } = memoryReplica({ ...SESSION, cursor: 0 })
    const remote = gateway()
    const engine = new SyncEngine(replica, remote, new StaticNetworkStatus(true))

    await Promise.all([engine.sync(), engine.sync(), engine.sync()])
    await vi.runAllTimersAsync()

    expect(remote.pull).toHaveBeenCalledTimes(2)
  })

  it('regroupe les écritures rapprochées en un seul envoi', async () => {
    const { replica } = memoryReplica({ ...SESSION, cursor: 0 })
    const remote = gateway()
    const engine = new SyncEngine(replica, remote, new StaticNetworkStatus(true))
    await engine.sync()
    vi.mocked(remote.pull).mockClear()

    engine.schedule()
    engine.schedule()
    engine.schedule()
    await vi.runAllTimersAsync()

    expect(remote.pull).toHaveBeenCalledTimes(1)
  })

  it('abandonne un téléchargement interrompu sans rien garder', async () => {
    const memory = memoryReplica()
    const engine = new SyncEngine(
      memory.replica,
      gateway({ pull: async () => err(new ServerUnreachableError('coupure')) }),
      new StaticNetworkStatus(true),
    )

    const result = await engine.connect(SESSION, null)

    expect(result.ok).toBe(false)
    expect(memory.current()).toBeNull()
    expect(engine.status.phase).toBe('off')
  })

  it('abandonne le journal d’un autre compte resté branché', async () => {
    const memory = memoryReplica({ accountId: 'ancien', playerId: 'player-0', cursor: 12 })
    const engine = new SyncEngine(memory.replica, gateway(), new StaticNetworkStatus(true))

    expect(await engine.connect(SESSION, 'player-1')).toEqual({ ok: true, value: 'uploaded' })
    expect(memory.current()).toMatchObject({ accountId: 'account-1', cursor: 0 })
  })

  it('prévient de chaque changement d’état, et cesse sur demande', async () => {
    const { replica } = memoryReplica({ ...SESSION, cursor: 0 })
    const engine = new SyncEngine(replica, gateway(), new StaticNetworkStatus(true))
    const phases: string[] = []
    const stop = engine.subscribe((snapshot) => phases.push(snapshot.phase))

    await engine.sync()
    stop()
    await engine.disconnect({ wipe: false })

    expect(phases).toEqual(['off', 'off', 'syncing', 'syncing', 'idle'])
  })
})
