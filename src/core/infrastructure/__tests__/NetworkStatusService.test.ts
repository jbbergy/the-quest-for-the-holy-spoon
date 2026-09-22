import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BrowserNetworkStatus,
  StaticNetworkStatus,
} from '@/core/infrastructure/NetworkStatusService'

type Listener = (event: unknown) => void

/**
 * Faux environnement navigateur.
 *
 * Node ne fournit ni `navigator.onLine` ni `addEventListener` global : les poser
 * ici permet d'exercer l'implémentation réelle plutôt qu'un substitut, y compris
 * son désabonnement — la fuite la plus facile à introduire et la plus dure à
 * remarquer.
 */
function installBrowserGlobals(online: boolean): {
  emit: (event: 'online' | 'offline') => void
  listenerCount: () => number
  restore: () => void
} {
  const listeners = new Map<string, Set<Listener>>()
  const previous = {
    navigator: Reflect.get(globalThis, 'navigator'),
    add: Reflect.get(globalThis, 'addEventListener'),
    remove: Reflect.get(globalThis, 'removeEventListener'),
  }

  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  })
  Reflect.set(globalThis, 'addEventListener', (type: string, listener: Listener) => {
    const set = listeners.get(type) ?? new Set()
    set.add(listener)
    listeners.set(type, set)
  })
  Reflect.set(globalThis, 'removeEventListener', (type: string, listener: Listener) => {
    listeners.get(type)?.delete(listener)
  })

  return {
    emit: (event) => {
      for (const listener of listeners.get(event) ?? []) listener({})
    },
    listenerCount: () =>
      [...listeners.values()].reduce((total, set) => total + set.size, 0),
    restore: () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: previous.navigator,
        configurable: true,
        writable: true,
      })
      Reflect.set(globalThis, 'addEventListener', previous.add)
      Reflect.set(globalThis, 'removeEventListener', previous.remove)
    },
  }
}

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
})

describe('BrowserNetworkStatus', () => {
  it('reflète navigator.onLine', () => {
    const env = installBrowserGlobals(true)
    cleanup = env.restore

    expect(new BrowserNetworkStatus().isOnline()).toBe(true)
  })

  it('signale l’absence de connexion', () => {
    const env = installBrowserGlobals(false)
    cleanup = env.restore

    expect(new BrowserNetworkStatus().isOnline()).toBe(false)
  })

  it('notifie les passages en ligne et hors ligne', () => {
    const env = installBrowserGlobals(true)
    cleanup = env.restore
    const listener = vi.fn()

    new BrowserNetworkStatus().subscribe(listener)
    env.emit('offline')
    env.emit('online')

    expect(listener).toHaveBeenNthCalledWith(1, false)
    expect(listener).toHaveBeenNthCalledWith(2, true)
  })

  it('retire ses écouteurs au désabonnement', () => {
    const env = installBrowserGlobals(true)
    cleanup = env.restore
    const listener = vi.fn()

    const unsubscribe = new BrowserNetworkStatus().subscribe(listener)
    expect(env.listenerCount()).toBe(2)

    unsubscribe()

    expect(env.listenerCount()).toBe(0)
    env.emit('offline')
    expect(listener).not.toHaveBeenCalled()
  })

  it('se considère en ligne hors navigateur, faute de mieux', () => {
    // Rendu serveur ou test : supposer « hors ligne » désactiverait à tort
    // l'enrichissement distant.
    const previous = Reflect.get(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    cleanup = () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: previous,
        configurable: true,
        writable: true,
      })
    }

    expect(new BrowserNetworkStatus().isOnline()).toBe(true)
  })

  it('accepte un abonnement inerte quand l’environnement n’a pas d’événements', () => {
    const previous = Reflect.get(globalThis, 'addEventListener')
    Reflect.set(globalThis, 'addEventListener', undefined)
    cleanup = () => Reflect.set(globalThis, 'addEventListener', previous)

    const unsubscribe = new BrowserNetworkStatus().subscribe(vi.fn())

    expect(() => unsubscribe()).not.toThrow()
  })
})

describe('StaticNetworkStatus', () => {
  it('retourne l’état fixé', () => {
    expect(new StaticNetworkStatus(false).isOnline()).toBe(false)
    expect(new StaticNetworkStatus(true).isOnline()).toBe(true)
  })

  it('notifie ses abonnés au changement d’état', () => {
    const status = new StaticNetworkStatus(true)
    const listener = vi.fn()
    status.subscribe(listener)

    status.set(false)

    expect(status.isOnline()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
  })

  it('cesse de notifier après désabonnement', () => {
    const status = new StaticNetworkStatus(true)
    const listener = vi.fn()

    status.subscribe(listener)()
    status.set(false)

    expect(listener).not.toHaveBeenCalled()
  })
})
