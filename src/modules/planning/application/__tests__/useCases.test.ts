import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { isErr, isOk } from '@/core/result'
import { type MealSummary, MealType } from '@/modules/nutrition_inventory/application'
import { CompletionStatus } from '@/modules/planning/domain/MealCompletionService'
import { SuggestMealCompletionUseCase } from '@/modules/planning/application/useCases'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

const needs: PlayerNutritionalNeeds = {
  playerId: idFrom('player-1'),
  targetCalories: 2000,
  targetMacros: { proteinG: 150, carbsG: 200, fatG: 66.7 },
  referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 26.7, saltG: 5 },
  restrictions: [],
  allergens: [],
}

const summary = (
  calories: number,
  macros: { proteinG: number; carbsG: number; fatG: number },
): MealSummary => ({
  mealId: idFrom('meal-1'),
  playerId: needs.playerId,
  type: MealType.LUNCH,
  loggedAt: '2026-04-10T12:30:00.000Z',
  // `planning` ne reçoit que des repas déjà pris : le tri est fait en amont.
  consumedAt: '2026-04-10T12:45:00.000Z',
  entryCount: 2,
  macros,
  // `planning` ignore ces valeurs : sa suggestion reste calorique et
  // macronutritionnelle. Elles figurent au read model, donc à la fixture.
  detail: { fiberG: 0, sugarsG: 0, saturatedFatG: 0, saltG: 0 },
  calories,
  entries: [],
})

const useCase = new SuggestMealCompletionUseCase()

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

describe('SuggestMealCompletionUseCase', () => {
  it('propose la cible entière pour une journée vierge', () => {
    const profile = unwrap(useCase.execute(needs, []))

    expect(profile.status).toBe(CompletionStatus.ON_TRACK)
    expect(profile.remainingCalories).toBe(2000)
    expect(profile.remainingMacros).toEqual(needs.targetMacros)
  })

  it('soustrait les repas déjà consommés', () => {
    const profile = unwrap(
      useCase.execute(needs, [summary(600, { proteinG: 40, carbsG: 60, fatG: 20 })]),
    )

    expect(profile.remainingCalories).toBe(1400)
    expect(profile.remainingMacros.proteinG).toBeCloseTo(110, 10)
  })

  it('agrège plusieurs repas de la journée', () => {
    const profile = unwrap(
      useCase.execute(needs, [
        summary(400, { proteinG: 20, carbsG: 50, fatG: 10 }),
        summary(600, { proteinG: 40, carbsG: 60, fatG: 20 }),
      ]),
    )

    expect(profile.completionRatio).toBeCloseTo(0.5, 10)
  })

  it('oriente les ratios vers la macro la plus déficitaire', () => {
    const profile = unwrap(
      useCase.execute(needs, [summary(900, { proteinG: 10, carbsG: 200, fatG: 10 })]),
    )

    expect(profile.idealRatios.protein).toBeGreaterThan(profile.idealRatios.carbs)
  })

  it('signale une journée complète', () => {
    const profile = unwrap(
      useCase.execute(needs, [summary(2000, { proteinG: 150, carbsG: 200, fatG: 66.7 })]),
    )

    expect(profile.status).toBe(CompletionStatus.COMPLETE)
    expect(profile.idealRatios).toEqual({ protein: 0, carbs: 0, fat: 0 })
  })

  it('signale un dépassement et le chiffre', () => {
    const profile = unwrap(
      useCase.execute(needs, [summary(2500, { proteinG: 180, carbsG: 260, fatG: 80 })]),
    )

    expect(profile.status).toBe(CompletionStatus.EXCEEDED)
    expect(profile.excessCalories).toBe(500)
  })

  it('enveloppe un besoin invalide en erreur applicative', () => {
    const result = useCase.execute({ ...needs, targetCalories: 0 }, [])

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('COMPLETION_NOT_COMPUTABLE')
      expect((result.error.cause as Error & { code: string }).code).toBe(
        'INVALID_NUTRITIONAL_NEEDS',
      )
    }
  })

  it('ne consomme que des read models, jamais Player ni Meal', () => {
    // Les deux entrées sont des objets nus : c'est ce qui garantit que `planning`
    // ne peut pas acquérir de dépendance vers les entités d'autrui.
    const result = useCase.execute(
      {
        playerId: idFrom('p'),
        targetCalories: 1800,
        targetMacros: { proteinG: 100, carbsG: 200, fatG: 60 },
        referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 24, saltG: 5 },
        restrictions: [],
        allergens: [],
      },
      [],
    )

    expect(isOk(result)).toBe(true)
  })

  it('est synchrone : aucune I/O, donc aucun repository à monter', () => {
    const result = useCase.execute(needs, [])

    expect(result).not.toBeInstanceOf(Promise)
  })
})
