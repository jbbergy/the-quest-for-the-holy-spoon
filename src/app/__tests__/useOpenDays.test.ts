import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useOpenDaysStore } from '@/app/useOpenDays'
import { parseDayKey } from '@/core/day'

const monday = parseDayKey('2026-09-21')!
const tuesday = parseDayKey('2026-09-22')!

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useOpenDaysStore', () => {
  it('replie tous les jours au lancement', () => {
    expect(useOpenDaysStore().isOpen(monday)).toBe(false)
  })

  it('retient chaque jour déplié, indépendamment des autres', () => {
    const store = useOpenDaysStore()

    store.setOpen(monday, true)

    expect(store.isOpen(monday)).toBe(true)
    expect(store.isOpen(tuesday)).toBe(false)
  })

  it('garde l’état d’un écran à l’autre, pour toute la session', () => {
    useOpenDaysStore().setOpen(monday, true)

    // Un autre écran relit le même store : l'état n'a pas bougé.
    expect(useOpenDaysStore().isOpen(monday)).toBe(true)
  })

  it('replie un jour de nouveau', () => {
    const store = useOpenDaysStore()
    store.setOpen(monday, true)

    store.setOpen(monday, false)

    expect(store.isOpen(monday)).toBe(false)
  })

  it('repart replié dans une nouvelle session', () => {
    useOpenDaysStore().setOpen(monday, true)

    setActivePinia(createPinia())

    expect(useOpenDaysStore().isOpen(monday)).toBe(false)
  })
})
