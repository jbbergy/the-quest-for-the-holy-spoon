import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { provideContainer, resetContainer } from '@/app/container'
import { useTodayStore } from '@/app/day/useTodayStore'
import { useProfileEditing } from '@/app/useProfileEditing'
import { ApplicationError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { unwrapOr } from '@/core/result'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { createFakeContainer, succeedsWith } from './fakeContainer'

const player = Player.reconstitute({
  id: idFrom('player-1'),
  name: 'Alex',
  measurements: BodyMeasurements.reconstitute({
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
  }),
  activityLevel: ActivityLevel.MODERATE,
  preferences: DietaryPreferences.none(),
})

/** Un autre nom : le besoin ne bouge pas. */
const renamed = unwrapOr(player.rename('Sam'), player)

/** Moins actif : le besoin baisse. */
const calmer = player.withActivityLevel(ActivityLevel.SEDENTARY)

const unreadable = new ApplicationError('MEALS_UNREADABLE', 'Repas illisibles.')

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown }

const done = (value: unknown): Outcome => ({ ok: true, value })
const failed = (error: unknown): Outcome => ({ ok: false, error })

async function setUp(outcomes: { update?: Outcome; rescalePlanned?: Outcome }) {
  const update = vi.fn(async () => outcomes.update ?? done(calmer))
  const rescalePlanned = vi.fn(async () => outcomes.rescalePlanned ?? done(4))
  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player), update: { execute: update } } as never,
      inventory: { rescalePlanned: { execute: rescalePlanned } } as never,
    }),
  )
  await usePlayerStore().load()
  return { update, rescalePlanned }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useProfileEditing', () => {
  it('ajuste les repas prévus dès aujourd’hui, au rapport des besoins', async () => {
    const spies = await setUp({})
    const before = usePlayerStore().needs!.targetCalories
    const editing = useProfileEditing()

    const outcome = await editing.save({ activityLevel: ActivityLevel.SEDENTARY })

    expect(outcome).toEqual({ rescaledMeals: 4 })
    const after = usePlayerStore().needs!.targetCalories
    expect(after).toBeLessThan(before)
    expect(spies.update).toHaveBeenCalledWith(
      { activityLevel: ActivityLevel.SEDENTARY },
      useTodayStore().today,
    )
    const [playerId, from, scale] = spies.rescalePlanned.mock.calls[0] as unknown as [
      string,
      string,
      number,
    ]
    expect(playerId).toBe(player.id)
    expect(from).toBe(useTodayStore().today)
    expect(scale).toBeCloseTo(after / before, 5)
    expect(editing.saving.value).toBe(false)
  })

  it('ne touche à aucun repas quand le besoin ne change pas', async () => {
    const spies = await setUp({ update: done(renamed) })

    const outcome = await useProfileEditing().save({ name: 'Sam' })

    expect(outcome).toEqual({ rescaledMeals: 0 })
    expect(spies.rescalePlanned).not.toHaveBeenCalled()
  })

  it('n’ajuste rien si le profil n’a pas pu être enregistré', async () => {
    const spies = await setUp({ update: failed(new ApplicationError('PROFILE_UNSAVED', 'Échec.')) })

    const outcome = await useProfileEditing().save({ activityLevel: ActivityLevel.SEDENTARY })

    expect(outcome).toBeNull()
    expect(usePlayerStore().error).not.toBeNull()
    expect(spies.rescalePlanned).not.toHaveBeenCalled()
  })

  it('garde le profil enregistré et dit l’échec des repas', async () => {
    await setUp({ rescalePlanned: failed(unreadable) })
    const editing = useProfileEditing()

    const outcome = await editing.save({ activityLevel: ActivityLevel.SEDENTARY })

    expect(outcome).toEqual({ rescaledMeals: 0 })
    expect(editing.mealsError.value?.code).toBe('MEALS_UNREADABLE')
    expect(usePlayerStore().profileView?.activityLevel).toBe(ActivityLevel.SEDENTARY)
  })
})
