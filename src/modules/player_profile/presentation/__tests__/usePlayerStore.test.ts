import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createFakeContainer,
  failsWith,
  succeedsWith,
} from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ApplicationError, InvalidMeasurementError } from '@/core/errors'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { idFrom } from '@/core/identity'

const player = Player.reconstitute({
  id: idFrom('player-1'),
  name: 'Perceval',
  measurements: BodyMeasurements.reconstitute({
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
  }),
  activityLevel: ActivityLevel.MODERATE,
  preferences: DietaryPreferences.none(),
})

const input = {
  name: 'Perceval',
  heightCm: 180,
  weightKg: 80,
  ageYears: 30,
  biologicalSex: BiologicalSex.MALE,
  activityLevel: ActivityLevel.MODERATE,
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('usePlayerStore', () => {
  it('part d’un état vierge', () => {
    provideContainer(createFakeContainer())
    const store = usePlayerStore()

    expect(store.player).toBeNull()
    expect(store.status).toBe('idle')
    expect(store.error).toBeNull()
    expect(store.needs).toBeNull()
  })

  describe('succès', () => {
    beforeEach(() => {
      provideContainer(
        createFakeContainer({ profile: { getCurrent: succeedsWith(player) } as never }),
      )
    })

    it('déplie un Result en succès vers l’état', async () => {
      const store = usePlayerStore()

      const loaded = await store.load()

      expect(loaded).toBe(true)
      expect(store.status).toBe('ready')
      expect(store.player?.name).toBe('Perceval')
      expect(store.error).toBeNull()
    })

    it('expose le read model consommé par planning', async () => {
      const store = usePlayerStore()

      await store.load()

      expect(store.needs?.playerId).toBe(player.id)
      expect(store.needs?.targetCalories).toBe(player.targetCalories())
    })

    it('expose le read model d’affichage', async () => {
      const store = usePlayerStore()

      await store.load()

      expect(store.profileView?.basalMetabolicRate).toBe(player.basalMetabolicRate())
    })

    it('reste « ready » avec un profil nul quand l’onboarding n’a pas eu lieu', async () => {
      resetContainer()
      provideContainer(
        createFakeContainer({ profile: { getCurrent: succeedsWith(null) } as never }),
      )
      const store = usePlayerStore()

      await store.load()

      expect(store.status).toBe('ready')
      expect(store.player).toBeNull()
    })
  })

  describe('échec', () => {
    const error = new ApplicationError('PROFILE_NOT_LOADED', 'illisible')

    beforeEach(() => {
      provideContainer(createFakeContainer({ profile: { getCurrent: failsWith(error) } as never }))
    })

    it('expose une erreur typée, pas une chaîne', async () => {
      const store = usePlayerStore()

      const loaded = await store.load()

      expect(loaded).toBe(false)
      expect(store.status).toBe('error')
      // Le composant mappe `kind`/`code` vers un message localisé ; le message
      // brut reste destiné au développeur.
      expect(store.error).toEqual({
        kind: 'application',
        code: 'PROFILE_NOT_LOADED',
        message: 'illisible',
      })
    })

    it('ne remplace pas l’état précédent par du vide', async () => {
      const store = usePlayerStore()
      store.player = player

      await store.load()

      expect(store.player).toBe(player)
    })

    it('efface l’erreur sur demande', async () => {
      const store = usePlayerStore()
      await store.load()

      store.clearError()

      expect(store.error).toBeNull()
      expect(store.status).toBe('idle')
    })
  })

  describe('create', () => {
    it('met l’état à jour et retourne true', async () => {
      provideContainer(createFakeContainer({ profile: { create: succeedsWith(player) } as never }))
      const store = usePlayerStore()

      expect(await store.create(input)).toBe(true)
      expect(store.player?.id).toBe(player.id)
    })

    it('expose l’erreur de domaine remontée par le Use Case', async () => {
      provideContainer(
        createFakeContainer({
          profile: { create: failsWith(new InvalidMeasurementError('poids aberrant')) } as never,
        }),
      )
      const store = usePlayerStore()

      expect(await store.create({ ...input, weightKg: 5 })).toBe(false)
      expect(store.error?.kind).toBe('domain')
      expect(store.error?.code).toBe('INVALID_MEASUREMENT')
    })
  })

  describe('update', () => {
    it('réassigne la référence plutôt que de muter l’entité', async () => {
      const updated = player.withActivityLevel(ActivityLevel.SEDENTARY)
      provideContainer(
        createFakeContainer({
          profile: { getCurrent: succeedsWith(player), update: succeedsWith(updated) } as never,
        }),
      )
      const store = usePlayerStore()
      await store.load()
      const before = store.player

      await store.update({ activityLevel: ActivityLevel.SEDENTARY })

      // C'est cette réassignation que les watchers GSAP observeront en phase 5 :
      // une mutation interne ne déclencherait rien.
      expect(store.player).not.toBe(before)
      expect(before?.activityLevel).toBe(ActivityLevel.MODERATE)
      expect(store.player?.activityLevel).toBe(ActivityLevel.SEDENTARY)
    })

    it('recalcule les besoins exposés à planning', async () => {
      const updated = player.withActivityLevel(ActivityLevel.SEDENTARY)
      provideContainer(
        createFakeContainer({
          profile: { getCurrent: succeedsWith(player), update: succeedsWith(updated) } as never,
        }),
      )
      const store = usePlayerStore()
      await store.load()
      const before = store.needs!.targetCalories

      await store.update({ activityLevel: ActivityLevel.SEDENTARY })

      expect(store.needs!.targetCalories).toBeLessThan(before)
    })
  })

  it('passe par « loading » pendant l’appel', async () => {
    let resolve: (value: unknown) => void = () => undefined
    const pending = new Promise((r) => {
      resolve = r
    })
    provideContainer(
      createFakeContainer({
        profile: { getCurrent: { execute: () => pending } } as never,
      }),
    )
    const store = usePlayerStore()

    const loading = store.load()
    expect(store.status).toBe('loading')

    resolve({ ok: true, value: player })
    await loading
    expect(store.status).toBe('ready')
  })

  it('n’appelle le Use Case qu’une fois par action', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: player }))
    provideContainer(createFakeContainer({ profile: { getCurrent: { execute } } as never }))

    await usePlayerStore().load()

    expect(execute).toHaveBeenCalledTimes(1)
  })
})
