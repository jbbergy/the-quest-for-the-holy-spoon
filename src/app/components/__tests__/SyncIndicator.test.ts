// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, fakeSyncEngine } from '@/app/__tests__/fakeContainer'
import SyncIndicator from '@/app/components/SyncIndicator.vue'
import { provideContainer, resetContainer } from '@/app/container'
import type { SyncSnapshot } from '@/app/sync/SyncEngine'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import { ok } from '@/core/result'

/** Moteur factice dont on pilote l'état et les arrivées distantes. */
function controllableEngine() {
  const listeners = new Set<(snapshot: SyncSnapshot) => void>()
  const remote = new Set<(entities: ReadonlySet<string>) => void>()
  let status: SyncSnapshot = { phase: 'idle', pending: 0, lastSyncedAt: null, error: null }
  const engine = Object.assign(fakeSyncEngine(), {
    get status() {
      return status
    },
    subscribe: (listener: (snapshot: SyncSnapshot) => void) => {
      listeners.add(listener)
      listener(status)
      return () => listeners.delete(listener)
    },
    onRemoteChanges: (listener: (entities: ReadonlySet<string>) => void) => {
      remote.add(listener)
      return () => remote.delete(listener)
    },
    sync: vi.fn(async () => undefined),
  })
  return {
    engine,
    set(next: Partial<SyncSnapshot>) {
      status = { ...status, ...next }
      listeners.forEach((listener) => listener(status))
    },
    arrive(entities: string[]) {
      remote.forEach((listener) => listener(new Set(entities)))
    },
  }
}

let control: ReturnType<typeof controllableEngine>
const getCurrent = vi.fn(async () => ok(null))

beforeEach(() => {
  setActivePinia(createPinia())
  control = controllableEngine()
  getCurrent.mockClear()
  provideContainer(
    createFakeContainer({ sync: control.engine, profile: { getCurrent: { execute: getCurrent } } }),
  )
})

afterEach(() => {
  resetContainer()
})

describe('SyncIndicator', () => {
  it('ne s’affiche pas sans compte', async () => {
    control.set({ phase: 'off' })
    const wrapper = mount(SyncIndicator)
    expect(wrapper.text()).toBe('')
  })

  it.each([
    [{ phase: 'idle', pending: 0 }, 'À jour'],
    [{ phase: 'idle', pending: 1 }, '1 modification en attente'],
    [{ phase: 'syncing', pending: 0 }, 'Synchronisation…'],
    [{ phase: 'offline', pending: 3 }, 'Hors ligne — 3 modifications en attente'],
    [{ phase: 'offline', pending: 0 }, 'Hors ligne'],
    [{ phase: 'error', pending: 0 }, 'Synchronisation impossible'],
  ] as const)('dit l’état %o : « %s »', async (state, label) => {
    const wrapper = mount(SyncIndicator)
    control.set(state)
    await flushPromises()
    expect(wrapper.find('.sync__label').text()).toBe(label)
  })

  it('n’annonce que les moments qui comptent', async () => {
    const wrapper = mount(SyncIndicator)
    const region = () => wrapper.find('[role="status"]').text()

    control.set({ phase: 'syncing' })
    await flushPromises()
    expect(region()).toBe('')

    control.set({ phase: 'offline' })
    await flushPromises()
    expect(region()).toContain('Hors ligne')

    control.set({ phase: 'idle' })
    await flushPromises()
    expect(region()).toBe('Synchronisation rétablie.')
  })

  it('relance à la demande', async () => {
    const wrapper = mount(SyncIndicator)
    control.set({ phase: 'error' })
    await flushPromises()

    await wrapper.find('button').trigger('click')
    expect(control.engine.sync).toHaveBeenCalled()
  })
})

describe('useSyncStatus', () => {
  it('recharge le profil et signale les arrivées distantes', () => {
    const { remoteRevision } = useSyncStatus()

    control.arrive(['meal'])
    expect(remoteRevision.value).toBe(1)
    expect(getCurrent).not.toHaveBeenCalled()

    control.arrive(['player'])
    expect(remoteRevision.value).toBe(2)
    expect(getCurrent).toHaveBeenCalled()
  })

  it('partage le même état entre les composants', () => {
    expect(useSyncStatus()).toBe(useSyncStatus())
  })
})
