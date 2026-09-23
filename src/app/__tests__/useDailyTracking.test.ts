import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { provideContainer, resetContainer } from '@/app/container'
import { useDailyTracking } from '@/app/useDailyTracking'
import { ApplicationError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { MealType } from '@/modules/nutrition_inventory/application'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { CompletionStatus } from '@/modules/planning/application'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { createFakeContainer, failsWith, succeedsWith } from './fakeContainer'

import {
  SuggestMealCompletionUseCase,
  SummarizeRecentIntakeUseCase,
} from '@/modules/planning/application'

const playerId: PlayerId = idFrom('player-1')

const player = Player.reconstitute({
  id: playerId,
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

const emptyJournal = { day: '2026-04-10', meals: [], consumedMeals: [], totalCalories: 0 }

const festin = {
  mealId: idFrom('meal-1'),
  playerId,
  type: MealType.LUNCH,
  loggedAt: '2026-04-10T12:30:00.000Z',
  plannedFor: '2026-04-10',
  consumedAt: '2026-04-10T12:45:00.000Z',
  entryCount: 1,
  macros: { proteinG: 300, carbsG: 400, fatG: 150 },
  calories: 6000,
  entries: [],
}

const fullJournal = {
  day: '2026-04-10',
  meals: [festin],
  consumedMeals: [festin],
  totalCalories: 6000,
}

/** Le même festin, composé mais pas encore mangé. */
const plannedJournal = {
  day: '2026-04-10',
  meals: [{ ...festin, consumedAt: null }],
  consumedMeals: [],
  totalCalories: 0,
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useDailyTracking', () => {
  it('ne propose rien tant que le profil n’est pas chargé', () => {
    provideContainer(
      createFakeContainer({ planning: { suggestCompletion: new SuggestMealCompletionUseCase() } }),
    )

    expect(useDailyTracking().suggestion.value).toBeNull()
  })

  it('dérive la suggestion des deux read models, sans chargement dédié', async () => {
    provideContainer(
      createFakeContainer({
        profile: { getCurrent: succeedsWith(player) } as never,
        inventory: { journal: succeedsWith(emptyJournal) } as never,
        planning: { suggestCompletion: new SuggestMealCompletionUseCase() },
      }),
    )
    await usePlayerStore().load()
    const tracking = useDailyTracking()

    await useJournalStore().load(playerId)

    expect(tracking.suggestion.value?.status).toBe(CompletionStatus.ON_TRACK)
    expect(tracking.suggestion.value?.remainingCalories).toBeCloseTo(player.targetCalories(), 6)
  })

  it('réévalue la suggestion quand le journal change, sans intervention de la vue', async () => {
    provideContainer(
      createFakeContainer({
        profile: { getCurrent: succeedsWith(player) } as never,
        inventory: { journal: succeedsWith(fullJournal) } as never,
        planning: { suggestCompletion: new SuggestMealCompletionUseCase() },
      }),
    )
    await usePlayerStore().load()
    const tracking = useDailyTracking()
    expect(tracking.suggestion.value?.status).toBe(CompletionStatus.ON_TRACK)

    await useJournalStore().load(playerId)

    // C'est tout l'intérêt d'une dérivation plutôt que d'un état : personne n'a
    // eu à penser à rafraîchir la recommandation.
    expect(tracking.suggestion.value?.status).toBe(CompletionStatus.EXCEEDED)
  })

  it('ignore un repas composé mais pas encore pris', async () => {
    provideContainer(
      createFakeContainer({
        profile: { getCurrent: succeedsWith(player) } as never,
        inventory: { journal: succeedsWith(plannedJournal) } as never,
        planning: { suggestCompletion: new SuggestMealCompletionUseCase() },
      }),
    )
    await usePlayerStore().load()
    const tracking = useDailyTracking()

    await useJournalStore().load(playerId)

    // Le même repas, une fois pris, fait basculer la journée en EXCEEDED (test
    // précédent). Tant qu'il n'est que prévu, l'assistant doit l'ignorer —
    // sinon il conseillerait de ne plus rien manger à quelqu'un à jeun.
    expect(tracking.suggestion.value?.status).toBe(CompletionStatus.ON_TRACK)
    expect(tracking.suggestion.value?.remainingCalories).toBeCloseTo(player.targetCalories(), 6)
  })

  it('réévalue la suggestion quand le profil du joueur change', async () => {
    provideContainer(
      createFakeContainer({
        profile: {
          getCurrent: succeedsWith(player),
          update: succeedsWith(player.withActivityLevel(ActivityLevel.SEDENTARY)),
        } as never,
        planning: { suggestCompletion: new SuggestMealCompletionUseCase() },
      }),
    )
    const players = usePlayerStore()
    await players.load()
    const tracking = useDailyTracking()
    const before = tracking.suggestion.value!.remainingCalories

    await players.update({ activityLevel: ActivityLevel.SEDENTARY })

    expect(tracking.suggestion.value!.remainingCalories).toBeLessThan(before)
  })

  it('expose l’erreur de calcul sans effet de bord dans le computed', async () => {
    const broken = Player.reconstitute({
      ...player,
      // Un TDEE nul rend la cible calorique invalide pour le service de domaine.
      measurements: BodyMeasurements.reconstitute({
        heightCm: 50,
        weightKg: 20,
        ageYears: 120,
        biologicalSex: BiologicalSex.FEMALE,
      }),
    })
    provideContainer(
      createFakeContainer({
        profile: { getCurrent: succeedsWith(broken) } as never,
        planning: { suggestCompletion: new SuggestMealCompletionUseCase() },
      }),
    )
    await usePlayerStore().load()
    const tracking = useDailyTracking()

    expect(tracking.suggestion.value).toBeNull()
    expect(tracking.suggestionError.value?.code).toBe('COMPLETION_NOT_COMPUTABLE')
    // Deux lectures successives doivent donner le même résultat : un computed
    // qui écrirait dans une ref ne le garantirait pas.
    expect(tracking.suggestionError.value?.code).toBe('COMPLETION_NOT_COMPUTABLE')
  })

  it('charge le journal du jour demandé', async () => {
    const journal = vi.fn(async () => ({ ok: true as const, value: emptyJournal }))
    provideContainer(createFakeContainer({ inventory: { journal: { execute: journal } } as never }))
    const day = new Date(2026, 3, 10)

    expect(await useDailyTracking().loadDay(playerId, day)).toBe(true)
    expect(journal).toHaveBeenCalledWith(playerId, day)
  })

  describe('moyennes de la semaine écoulée', () => {
    const yesterdayShort = {
      day: '2026-04-09',
      consumedMealCount: 2,
      calories: player.targetCalories() - 300,
      macros: player.targetMacros().toJSON(),
      detail: player.referenceNutrients().toJSON(),
    }

    const withHistory = (history: unknown) =>
      createFakeContainer({
        profile: { getCurrent: succeedsWith(player) } as never,
        inventory: { journal: succeedsWith(emptyJournal), history } as never,
        planning: {
          suggestCompletion: new SuggestMealCompletionUseCase(),
          recentIntake: new SummarizeRecentIntakeUseCase(),
        },
      })

    it('lit les sept jours précédant la journée demandée', async () => {
      const history = vi.fn(async () => ({ ok: true as const, value: [] }))
      provideContainer(withHistory({ execute: history }))

      await useDailyTracking().loadDay(playerId, new Date(2026, 3, 10))

      expect(history).toHaveBeenCalledWith(playerId, '2026-04-03', '2026-04-09')
    })

    it('expose la moyenne sans toucher à l’objectif du jour', async () => {
      provideContainer(withHistory(succeedsWith([yesterdayShort])))
      await usePlayerStore().load()
      const tracking = useDailyTracking()

      await tracking.loadDay(playerId, new Date(2026, 3, 10))

      expect(tracking.recent.value?.nutrients.calories.gap).toBeCloseTo(-300, 6)
      // Un déficit passé ne se rattrape pas : l'assistant vise le besoin habituel.
      expect(tracking.suggestion.value?.remainingCalories).toBeCloseTo(player.targetCalories(), 6)
    })

    it('n’affiche aucune moyenne quand l’historique est illisible', async () => {
      provideContainer(
        withHistory(failsWith(new ApplicationError('HISTORY_UNREADABLE', 'illisible'))),
      )
      await usePlayerStore().load()
      const tracking = useDailyTracking()

      expect(await tracking.loadDay(playerId, new Date(2026, 3, 10))).toBe(false)

      expect(tracking.recent.value).toBeNull()
      expect(useConsumptionHistoryStore().error?.code).toBe('HISTORY_UNREADABLE')
    })
  })
})
