import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { prefersReducedMotion, useReducedMotion } from '@/ui/useReducedMotion'

type Listener = (event: { matches: boolean }) => void

/** Média interrogeable, dont on peut déclencher le changement à la main. */
function stubMatchMedia(initial: boolean): {
  emit: (matches: boolean) => void
  listenerCount: () => number
} {
  const listeners = new Set<Listener>()

  globalThis.matchMedia = vi.fn(() => ({
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, listener: Listener) => void listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => void listeners.delete(listener),
  })) as unknown as typeof matchMedia

  return {
    emit: (matches) => {
      for (const listener of listeners) listener({ matches })
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'matchMedia')
  vi.restoreAllMocks()
})

describe('useReducedMotion', () => {
  it('reflète la préférence initiale', () => {
    stubMatchMedia(true)
    const scope = effectScope()

    const reduced = scope.run(() => useReducedMotion())

    expect(reduced?.value).toBe(true)
    scope.stop()
  })

  it('suit le changement de préférence en cours de session', () => {
    const media = stubMatchMedia(false)
    const scope = effectScope()
    const reduced = scope.run(() => useReducedMotion())

    media.emit(true)

    expect(reduced?.value).toBe(true)
    scope.stop()
  })

  it('retire son écouteur à la destruction de la portée', () => {
    const media = stubMatchMedia(false)
    const scope = effectScope()
    scope.run(() => useReducedMotion())
    expect(media.listenerCount()).toBe(1)

    scope.stop()

    // Sans ce retrait, chaque montage de jauge laisserait un écouteur derrière
    // lui — la fuite la plus facile à introduire dans un composable.
    expect(media.listenerCount()).toBe(0)
  })

  it('suppose le mouvement autorisé hors navigateur', () => {
    Reflect.deleteProperty(globalThis, 'matchMedia')
    const scope = effectScope()

    const reduced = scope.run(() => useReducedMotion())

    expect(reduced?.value).toBe(false)
    scope.stop()
  })
})

describe('prefersReducedMotion', () => {
  it('lit la préférence sans portée réactive', () => {
    stubMatchMedia(true)

    expect(prefersReducedMotion()).toBe(true)
  })

  it('retourne false hors navigateur', () => {
    Reflect.deleteProperty(globalThis, 'matchMedia')

    expect(prefersReducedMotion()).toBe(false)
  })
})
