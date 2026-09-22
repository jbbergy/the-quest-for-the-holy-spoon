import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '@/core/result'
import {
  CompletionStatus,
  type ConsumedTotals,
  type DailyTarget,
  type IdealFoodProfile,
  MealCompletionService,
} from '@/modules/planning/domain/MealCompletionService'

/** Cible : 2000 kcal, 150 P / 200 G / 67 L (≈ 2003 kcal, assez proche pour les tests). */
const target: DailyTarget = {
  calories: 2000,
  macros: { proteinG: 150, carbsG: 200, fatG: 66.7 },
}

const meal = (
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
): ConsumedTotals => ({ calories, macros: { proteinG, carbsG, fatG } })

const compute = (
  consumed: readonly ConsumedTotals[],
  dailyTarget: DailyTarget = target,
): IdealFoodProfile => {
  const result = MealCompletionService.computeMissing(dailyTarget, consumed)
  if (!isOk(result)) throw new Error(`calcul en échec : ${result.error.message}`)
  return result.value
}

describe('MealCompletionService', () => {
  describe('validation de la cible', () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuse une cible calorique de %p',
      (calories) => {
        const result = MealCompletionService.computeMissing({ ...target, calories }, [])

        expect(isErr(result)).toBe(true)
        if (isErr(result)) expect(result.error.code).toBe('INVALID_NUTRITIONAL_NEEDS')
      },
    )

    it.each([
      ['protéines négatives', { proteinG: -1, carbsG: 200, fatG: 60 }],
      ['glucides négatifs', { proteinG: 150, carbsG: -1, fatG: 60 }],
      ['lipides NaN', { proteinG: 150, carbsG: 200, fatG: Number.NaN }],
    ])('refuse des macros cibles avec %s', (_label, macros) => {
      const result = MealCompletionService.computeMissing({ ...target, macros }, [])

      expect(isErr(result)).toBe(true)
    })

    it('accepte une cible dont certaines macros sont nulles', () => {
      const result = MealCompletionService.computeMissing(
        { calories: 2000, macros: { proteinG: 150, carbsG: 0, fatG: 0 } },
        [],
      )

      expect(isOk(result)).toBe(true)
    })
  })

  describe('journée vierge', () => {
    it('renvoie la cible entière comme reste à consommer', () => {
      const profile = compute([])

      expect(profile.status).toBe(CompletionStatus.ON_TRACK)
      expect(profile.remainingCalories).toBe(2000)
      expect(profile.remainingMacros).toEqual(target.macros)
      expect(profile.completionRatio).toBe(0)
      expect(profile.excessCalories).toBe(0)
    })

    it('propose des ratios reflétant la répartition cible', () => {
      const profile = compute([])
      const sum =
        profile.idealRatios.protein + profile.idealRatios.carbs + profile.idealRatios.fat

      expect(sum).toBeCloseTo(1, 10)
      expect(profile.idealRatios.protein).toBeGreaterThan(0)
    })
  })

  describe('journée partiellement remplie', () => {
    it('soustrait les repas déjà consommés', () => {
      const profile = compute([meal(600, 40, 60, 20)])

      expect(profile.remainingCalories).toBe(1400)
      expect(profile.remainingMacros.proteinG).toBeCloseTo(110, 10)
      expect(profile.remainingMacros.carbsG).toBeCloseTo(140, 10)
      expect(profile.remainingMacros.fatG).toBeCloseTo(46.7, 10)
      expect(profile.status).toBe(CompletionStatus.ON_TRACK)
    })

    it('agrège plusieurs repas', () => {
      const profile = compute([meal(400, 20, 50, 10), meal(600, 40, 60, 20)])

      expect(profile.remainingCalories).toBe(1000)
      expect(profile.remainingMacros.proteinG).toBeCloseTo(90, 10)
      expect(profile.completionRatio).toBeCloseTo(0.5, 10)
    })

    it('oriente les ratios vers la macro la plus déficitaire', () => {
      // Le joueur a fait le plein de glucides, il lui manque surtout des protéines.
      const profile = compute([meal(900, 10, 200, 10)])

      expect(profile.idealRatios.protein).toBeGreaterThan(profile.idealRatios.carbs)
      expect(profile.remainingMacros.carbsG).toBe(0)
    })
  })

  describe('journée complète', () => {
    it('signale COMPLETE dès la tolérance atteinte', () => {
      const profile = compute([meal(1960, 150, 200, 66.7)])

      expect(profile.status).toBe(CompletionStatus.COMPLETE)
      expect(profile.excessCalories).toBe(0)
    })

    it('reste ON_TRACK juste sous la tolérance', () => {
      const profile = compute([meal(1950, 150, 200, 66.7)])

      expect(profile.status).toBe(CompletionStatus.ON_TRACK)
    })

    it('ne propose plus rien quand toutes les macros sont couvertes', () => {
      const profile = compute([meal(2000, 150, 200, 66.7)])

      expect(profile.remainingMacros).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 })
      expect(profile.remainingCalories).toBe(0)
      expect(profile.idealRatios).toEqual({ protein: 0, carbs: 0, fat: 0 })
    })
  })

  describe('dépassement', () => {
    it('signale EXCEEDED et chiffre l’excédent', () => {
      const profile = compute([meal(2500, 180, 260, 80)])

      expect(profile.status).toBe(CompletionStatus.EXCEEDED)
      expect(profile.excessCalories).toBe(500)
      expect(profile.completionRatio).toBeCloseTo(1.25, 10)
    })

    it('ne produit jamais de reste négatif', () => {
      const profile = compute([meal(3000, 300, 400, 150)])

      expect(profile.remainingCalories).toBe(0)
      expect(profile.remainingMacros.proteinG).toBe(0)
      expect(profile.remainingMacros.carbsG).toBe(0)
      expect(profile.remainingMacros.fatG).toBe(0)
    })

    it('reste cohérent quand une seule macro est dépassée', () => {
      const profile = compute([meal(1000, 200, 20, 10)])

      expect(profile.remainingMacros.proteinG).toBe(0)
      expect(profile.remainingMacros.carbsG).toBeCloseTo(180, 10)
      expect(profile.idealRatios.protein).toBe(0)
      expect(profile.idealRatios.carbs).toBeGreaterThan(0)
    })
  })

  it('ne dépend d’aucune entité : des objets nus suffisent à l’appeler', () => {
    const result = MealCompletionService.computeMissing(
      { calories: 1800, macros: { proteinG: 100, carbsG: 200, fatG: 60 } },
      [{ calories: 500, macros: { proteinG: 30, carbsG: 60, fatG: 15 } }],
    )

    expect(isOk(result)).toBe(true)
  })

  it('normalise toujours les ratios à 1 quand il reste quelque chose', () => {
    const cases: readonly ConsumedTotals[][] = [
      [],
      [meal(500, 30, 60, 15)],
      [meal(1200, 100, 100, 40)],
      [meal(1000, 200, 20, 10)],
    ]

    for (const consumed of cases) {
      const { idealRatios } = compute(consumed)
      const sum = idealRatios.protein + idealRatios.carbs + idealRatios.fat

      expect(sum).toBeCloseTo(1, 10)
    }
  })
})
