// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { localChanges } from '@/core/infrastructure/changeJournal'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'

import { PULL_INTERVAL_MS, type SyncEngine } from '../SyncEngine'
import { startSyncTriggers } from '../triggers'

let network: INetworkStatus & { emit(online: boolean): void }
let engine: { schedule: ReturnType<typeof vi.fn>; sync: ReturnType<typeof vi.fn> }
let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  const listeners = new Set<(online: boolean) => void>()
  network = {
    isOnline: () => true,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: (online) => listeners.forEach((listener) => listener(online)),
  }
  engine = { schedule: vi.fn(), sync: vi.fn(async () => undefined) }
  stop = startSyncTriggers(engine as unknown as SyncEngine, network)
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('Déclencheurs de synchronisation', () => {
  it('programme un envoi après une écriture locale', () => {
    localChanges.notify()
    expect(engine.schedule).toHaveBeenCalledTimes(1)
  })

  it('synchronise au retour du réseau, pas à sa perte', () => {
    network.emit(false)
    network.emit(true)
    expect(engine.sync).toHaveBeenCalledTimes(1)
  })

  it('synchronise au retour au premier plan et à intervalle régulier', () => {
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(PULL_INTERVAL_MS)
    expect(engine.sync).toHaveBeenCalledTimes(2)
  })

  it('se tait une fois arrêté', () => {
    stop()
    localChanges.notify()
    network.emit(true)
    vi.advanceTimersByTime(PULL_INTERVAL_MS)
    expect(engine.schedule).not.toHaveBeenCalled()
    expect(engine.sync).not.toHaveBeenCalled()
  })
})
