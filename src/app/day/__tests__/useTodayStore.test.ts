// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  InMemoryDayStartPreference,
  LocalDayStartPreference,
} from '@/app/day/DayStartPreference'
import { useTodayStore } from '@/app/day/useTodayStore'

let now: Date

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  now = new Date(2026, 8, 27, 23, 30)
  vi.setSystemTime(now)
})

afterEach(() => {
  useTodayStore().stop()
  vi.useRealTimers()
})

const storeWith = (hour = 0) => {
  const store = useTodayStore()
  store.configure({ preference: new InMemoryDayStartPreference(hour), clock: () => new Date() })
  store.initialize()
  return store
}

describe('useTodayStore', () => {
  it('bascule au jour suivant à minuit, sans rechargement', () => {
    const store = storeWith()
    expect(store.today).toBe('2026-09-27')

    vi.advanceTimersByTime(31 * 60 * 1000)

    expect(store.today).toBe('2026-09-28')
  })

  it('attend l’heure de début choisie pour basculer', () => {
    const store = storeWith(3)

    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    expect(store.today).toBe('2026-09-27')

    vi.advanceTimersByTime(91 * 60 * 1000)
    expect(store.today).toBe('2026-09-28')
  })

  it('applique et mémorise une nouvelle heure de début', () => {
    vi.setSystemTime(new Date(2026, 8, 28, 1, 0))
    const preference = new InMemoryDayStartPreference()
    const store = useTodayStore()
    store.configure({ preference })
    store.initialize()
    expect(store.today).toBe('2026-09-28')

    expect(store.setStartHour(4)).toBe(true)

    expect(store.today).toBe('2026-09-27')
    expect(preference.read()).toBe(4)
  })

  it('refuse une heure hors des choix proposés', () => {
    const store = storeWith()

    expect(store.setStartHour(24)).toBe(false)
    expect(store.setStartHour(-1)).toBe(false)
    expect(store.setStartHour(2.5)).toBe(false)
    expect(store.startHour).toBe(0)
  })

  it('suit un rythme décalé : journée qui commence à 15 h', () => {
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0))
    const store = storeWith(15)
    expect(store.today).toBe('2026-09-27')

    vi.advanceTimersByTime(5 * 60 * 60 * 1000 + 1000)

    expect(store.today).toBe('2026-09-28')
  })

  it('recalcule la journée au retour au premier plan', () => {
    const store = storeWith()
    // L'appareil s'est endormi : le minuteur n'a pas tourné, l'horloge si.
    vi.setSystemTime(new Date(2026, 8, 29, 8, 0))

    document.dispatchEvent(new Event('visibilitychange'))

    expect(store.today).toBe('2026-09-29')
  })
})

describe('LocalDayStartPreference', () => {
  afterEach(() => localStorage.clear())

  it('retombe sur minuit sans valeur, ou avec une valeur hors des choix', () => {
    const preference = new LocalDayStartPreference()
    expect(preference.read()).toBe(0)

    localStorage.setItem('holy-spoon.day-start', '24')
    expect(preference.read()).toBe(0)

    localStorage.setItem('holy-spoon.day-start', 'abc')
    expect(preference.read()).toBe(0)
  })

  it('relit l’heure enregistrée', () => {
    new LocalDayStartPreference().write(5)

    expect(new LocalDayStartPreference().read()).toBe(5)
  })
})
