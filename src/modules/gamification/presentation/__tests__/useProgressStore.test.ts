import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ApplicationError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { xpThresholdForLevel } from '@/modules/gamification/domain/Level'
import { PlayerProgress } from '@/modules/gamification/domain/PlayerProgress'
import { useProgressStore } from '@/modules/gamification/presentation/useProgressStore'

const playerId: PlayerId = idFrom('player-1')

const progressAt = (totalXp: number): PlayerProgress =>
  PlayerProgress.reconstitute({ playerId, totalXp })

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useProgressStore', () => {
  it('part au niveau 1 sans progression', () => {
    provideContainer(createFakeContainer())
    const store = useProgressStore()

    expect(store.level).toBe(1)
    expect(store.progressRatio).toBe(0)
    expect(store.view).toBeNull()
  })

  it('déplie un Result en succès vers le read model', async () => {
    provideContainer(
      createFakeContainer({ gamification: { getProgress: succeedsWith(progressAt(150)) } as never }),
    )
    const store = useProgressStore()

    expect(await store.load(playerId)).toBe(true)
    expect(store.view?.totalXp).toBe(150)
    expect(store.view?.xpToNextLevel).toBeGreaterThan(0)
    expect(store.status).toBe('ready')
  })

  it('expose une erreur typée', async () => {
    provideContainer(
      createFakeContainer({
        gamification: {
          getProgress: failsWith(new ApplicationError('PROGRESS_UNREADABLE', 'panne')),
        } as never,
      }),
    )
    const store = useProgressStore()

    expect(await store.load(playerId)).toBe(false)
    expect(store.error).toEqual({
      kind: 'application',
      code: 'PROGRESS_UNREADABLE',
      message: 'panne',
    })
  })

  describe('montée de niveau', () => {
    it('ne la signale pas au premier chargement', async () => {
      // Rouvrir l'application après avoir changé de niveau ne doit pas rejouer
      // l'animation : il n'y a pas de « avant » à comparer.
      provideContainer(
        createFakeContainer({
          gamification: {
            getProgress: succeedsWith(progressAt(xpThresholdForLevel(5))),
          } as never,
        }),
      )
      const store = useProgressStore()

      await store.load(playerId)

      expect(store.level).toBe(5)
      expect(store.levelledUp).toBe(false)
    })

    it('la signale quand le niveau augmente entre deux relectures', async () => {
      let totalXp = 0
      provideContainer(
        createFakeContainer({
          gamification: {
            getProgress: { execute: async () => ({ ok: true, value: progressAt(totalXp) }) },
          } as never,
        }),
      )
      const store = useProgressStore()
      await store.load(playerId)

      totalXp = xpThresholdForLevel(3)
      await store.load(playerId)

      expect(store.levelledUp).toBe(true)
      expect(store.level).toBe(3)
    })

    it('ne la signale pas quand seul l’XP progresse', async () => {
      let totalXp = 10
      provideContainer(
        createFakeContainer({
          gamification: {
            getProgress: { execute: async () => ({ ok: true, value: progressAt(totalXp) }) },
          } as never,
        }),
      )
      const store = useProgressStore()
      await store.load(playerId)

      totalXp = 20
      await store.load(playerId)

      expect(store.levelledUp).toBe(false)
    })

    it('se réarme après acquittement', async () => {
      let totalXp = 0
      provideContainer(
        createFakeContainer({
          gamification: {
            getProgress: { execute: async () => ({ ok: true, value: progressAt(totalXp) }) },
          } as never,
        }),
      )
      const store = useProgressStore()
      await store.load(playerId)
      totalXp = xpThresholdForLevel(2)
      await store.load(playerId)

      store.acknowledgeLevelUp()

      expect(store.levelledUp).toBe(false)
    })
  })

  it('expose le ratio d’avancement que la jauge consommera', async () => {
    const threshold = xpThresholdForLevel(4)
    const next = xpThresholdForLevel(5)
    provideContainer(
      createFakeContainer({
        gamification: {
          getProgress: succeedsWith(progressAt(Math.floor((threshold + next) / 2))),
        } as never,
      }),
    )
    const store = useProgressStore()

    await store.load(playerId)

    expect(store.progressRatio).toBeGreaterThan(0)
    expect(store.progressRatio).toBeLessThan(1)
  })
})
