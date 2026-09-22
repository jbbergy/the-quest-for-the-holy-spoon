import { beforeEach, describe, expect, it } from 'vitest'

import { createEvent } from '@/core/events'
import { idFrom, type PlayerId } from '@/core/identity'
import { err, isErr } from '@/core/result'
import {
  AwardXpForMealUseCase,
  GetPlayerProgressUseCase,
} from '@/modules/gamification/application/useCases'
import { xpThresholdForLevel } from '@/modules/gamification/domain/Level'
import { Milestone } from '@/modules/gamification/domain/PlayerProgress'
import { XP_RULES } from '@/modules/gamification/domain/XpRewardPolicy'
import { InMemoryPlayerProgressRepository } from '@/modules/gamification/infrastructure/InMemoryPlayerProgressRepository'
import {
  MEAL_LOGGED,
  type MealLoggedEvent,
  MealType,
} from '@/modules/nutrition_inventory/application'

const playerId: PlayerId = idFrom('player-1')

let progressRepository: InMemoryPlayerProgressRepository

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const mealEvent = (overrides: Partial<MealLoggedEvent['payload']> = {}): MealLoggedEvent =>
  createEvent(MEAL_LOGGED, {
    mealId: idFrom('meal-1'),
    playerId,
    type: MealType.LUNCH,
    entryCount: 2,
    macros: { proteinG: 30, carbsG: 50, fatG: 15 },
    calories: 455,
    ...overrides,
  })

beforeEach(() => {
  progressRepository = new InMemoryPlayerProgressRepository()
})

describe('AwardXpForMealUseCase', () => {
  const useCase = (): AwardXpForMealUseCase => new AwardXpForMealUseCase(progressRepository)

  it('crée la progression à la volée pour un joueur qui n’en a pas', async () => {
    // Rien n'oblige l'onboarding à initialiser le jeu.
    const gain = unwrap(await useCase().execute(mealEvent()))

    expect(gain.progress.playerId).toBe(playerId)
    expect(gain.progress.totalXp.value).toBeGreaterThan(0)
  })

  it('applique le barème du domaine', async () => {
    const gain = unwrap(await useCase().execute(mealEvent({ entryCount: 2 })))

    expect(gain.awarded.value).toBe(
      XP_RULES.baseMealXp + 2 * XP_RULES.perEntryXp + XP_RULES.balancedMealXp,
    )
  })

  it('n’attribue rien pour un repas sans calorie', async () => {
    const gain = unwrap(await useCase().execute(mealEvent({ calories: 0 })))

    expect(gain.awarded.isZero).toBe(true)
    expect(gain.levelledUp).toBe(false)
  })

  it('cumule les gains successifs', async () => {
    const first = unwrap(await useCase().execute(mealEvent()))
    const second = unwrap(await useCase().execute(mealEvent()))

    expect(second.progress.totalXp.value).toBe(first.progress.totalXp.value * 2)
  })

  it('persiste la progression', async () => {
    const gain = unwrap(await useCase().execute(mealEvent()))

    const stored = unwrap(await progressRepository.findByPlayer(playerId))
    expect(stored?.totalXp.value).toBe(gain.progress.totalXp.value)
  })

  it('rapporte la montée de niveau et les paliers franchis', async () => {
    const threshold = xpThresholdForLevel(2)
    let gain = unwrap(await useCase().execute(mealEvent()))
    while (gain.progress.totalXp.value < threshold) {
      gain = unwrap(await useCase().execute(mealEvent()))
    }

    expect(gain.progress.level.value).toBeGreaterThanOrEqual(2)
    expect(gain.levelledUp).toBe(true)
    expect(gain.unlockedMilestones).toContain(Milestone.APPRENTICE)
  })

  it('isole les joueurs', async () => {
    const other: PlayerId = idFrom('player-2')
    await useCase().execute(mealEvent())
    await useCase().execute(mealEvent({ playerId: other }))
    await useCase().execute(mealEvent({ playerId: other }))

    const mine = unwrap(await progressRepository.findByPlayer(playerId))
    const theirs = unwrap(await progressRepository.findByPlayer(other))
    expect(theirs!.totalXp.value).toBe(mine!.totalXp.value * 2)
  })

  it('enveloppe une panne de lecture', async () => {
    const broken = {
      findByPlayer: async () => err(Object.assign(new Error('panne'), { code: 'X' })),
    } as unknown as InMemoryPlayerProgressRepository

    const result = await new AwardXpForMealUseCase(broken).execute(mealEvent())

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('PROGRESS_UNREADABLE')
  })

  it('enveloppe une panne d’écriture', async () => {
    const broken = {
      findByPlayer: async () => ({ ok: true as const, value: null }),
      save: async () => err(Object.assign(new Error('disque plein'), { code: 'X' })),
    } as unknown as InMemoryPlayerProgressRepository

    const result = await new AwardXpForMealUseCase(broken).execute(mealEvent())

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('PROGRESS_NOT_SAVED')
  })

  it('ne consomme que le payload, sans rien connaître de Meal', async () => {
    // L'événement est un objet nu : aucune entité de nutrition_inventory n'a
    // besoin d'exister pour attribuer de l'XP.
    const gain = unwrap(
      await useCase().execute(
        createEvent(MEAL_LOGGED, {
          mealId: idFrom('m'),
          playerId,
          type: MealType.SNACK,
          entryCount: 1,
          macros: { proteinG: 1, carbsG: 1, fatG: 1 },
          calories: 20,
        }),
      ),
    )

    expect(gain.awarded.value).toBeGreaterThan(0)
  })
})

describe('GetPlayerProgressUseCase', () => {
  it('retourne une progression vierge pour un joueur inconnu', async () => {
    const progress = unwrap(
      await new GetPlayerProgressUseCase(progressRepository).execute(playerId),
    )

    expect(progress.totalXp.value).toBe(0)
    expect(progress.level.value).toBe(1)
  })

  it('retourne la progression enregistrée', async () => {
    await new AwardXpForMealUseCase(progressRepository).execute(mealEvent())

    const progress = unwrap(
      await new GetPlayerProgressUseCase(progressRepository).execute(playerId),
    )

    expect(progress.totalXp.value).toBeGreaterThan(0)
  })

  it('enveloppe une panne de lecture', async () => {
    const broken = {
      findByPlayer: async () => err(Object.assign(new Error('panne'), { code: 'X' })),
    } as unknown as InMemoryPlayerProgressRepository

    const result = await new GetPlayerProgressUseCase(broken).execute(playerId)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('PROGRESS_UNREADABLE')
  })
})
