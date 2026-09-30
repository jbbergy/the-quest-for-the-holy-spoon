import { describe, expect, it } from 'vitest'

import { addDays, type DayKey } from '@/core/day'
import { isErr } from '@/core/result'

import {
  type DailyIntake,
  type NutrientValues,
  type RecentIntake,
  RecentIntakeService,
} from '../RecentIntakeService'

const today = '2026-09-23' as DayKey
const daysAgo = (n: number): DayKey => addDays(today, -n)

const base: NutrientValues = {
  calories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 66,
  fiberG: 30,
  sugarsG: 100,
  saturatedFatG: 25,
  saltG: 5,
}

/** Une journée conforme aux repères, sauf pour les nutriments précisés. */
const intake = (ago: number, values: Partial<NutrientValues> = {}): DailyIntake => ({
  day: daysAgo(ago),
  values: { ...base, ...values },
})

const summarize = (history: readonly DailyIntake[]): RecentIntake => {
  const result = RecentIntakeService.summarize(today, () => base, history)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('RecentIntakeService', () => {
  it('ne calcule aucune moyenne sans jour renseigné', () => {
    const recent = summarize([])

    expect(recent.trackedDays).toBe(0)
    expect(recent.nutrients.calories).toEqual({
      nutrient: 'calories',
      kind: 'target',
      base: 2000,
      average: null,
      gap: null,
    })
  })

  it('moyenne les jours renseignés de la semaine écoulée', () => {
    const recent = summarize([
      intake(3, { calories: 1700, saltG: 8 }),
      intake(2, { calories: 2300, saltG: 6 }),
      intake(1, { calories: 1700, saltG: 7 }),
    ])

    expect(recent.trackedDays).toBe(3)
    expect(recent.nutrients.calories.average).toBe(1900)
    expect(recent.nutrients.calories.gap).toBe(-100)
    expect(recent.nutrients.saltG.average).toBe(7)
    expect(recent.nutrients.saltG.gap).toBe(2)
  })

  it('ne compte pas une journée sans repas pris comme un jeûne', () => {
    // J−2 n'apparaît pas dans l'historique : aucun repas n'y a été coché. Le
    // compter pour zéro ferait tomber la moyenne à 1 333 kcal.
    const recent = summarize([intake(3, { calories: 1800 }), intake(1, { calories: 2200 })])

    expect(recent.trackedDays).toBe(2)
    expect(recent.nutrients.calories.average).toBe(2000)
    expect(recent.recentDays.find((day) => day.day === daysAgo(2))).toEqual({
      day: daysAgo(2),
      tracked: false,
      intake: null,
      gap: null,
    })
  })

  it('ignore les jours au-delà de la semaine', () => {
    const recent = summarize([intake(8, { calories: 500 }), intake(7, { calories: 1800 })])

    expect(recent.trackedDays).toBe(1)
    expect(recent.nutrients.calories.average).toBe(1800)
  })

  it('ignore la journée en cours, qui n’est pas finie', () => {
    const recent = summarize([{ day: today, values: { ...base, calories: 500 } }])

    expect(recent.trackedDays).toBe(0)
  })

  it('annonce le sens de lecture de chaque repère', () => {
    const { nutrients } = summarize([])

    expect(nutrients.proteinG.kind).toBe('target')
    expect(nutrients.fiberG.kind).toBe('floor')
    expect(nutrients.sugarsG.kind).toBe('limit')
  })

  describe('bilan des jours récents', () => {
    it('couvre les sept jours précédents, du plus ancien au plus récent', () => {
      const { recentDays } = summarize([intake(1, { calories: 1800 })])

      expect(recentDays.map((day) => day.day)).toEqual([7, 6, 5, 4, 3, 2, 1].map(daysAgo))
      expect(recentDays.at(-1)).toMatchObject({
        tracked: true,
        intake: { calories: 1800 },
        gap: { calories: -200 },
      })
    })
  })

  describe('besoins qui changent', () => {
    // Le profil a changé il y a trois jours : avant, le besoin était de 2 400 kcal.
    const baseOn = (day: DayKey): NutrientValues =>
      day <= daysAgo(3) ? { ...base, calories: 2400 } : base
    const summarizeWith = (history: readonly DailyIntake[]) => {
      const result = RecentIntakeService.summarize(today, baseOn, history)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    }

    it('juge chaque jour avec les besoins qu’il avait', () => {
      const { recentDays } = summarizeWith([
        intake(4, { calories: 2400 }),
        intake(1, { calories: 2000 }),
      ])

      expect(recentDays.find((day) => day.day === daysAgo(4))?.gap?.calories).toBe(0)
      expect(recentDays.find((day) => day.day === daysAgo(1))?.gap?.calories).toBe(0)
    })

    it('fait la moyenne des écarts de chaque jour, pas l’écart de la moyenne', () => {
      const { nutrients } = summarizeWith([
        intake(4, { calories: 2400 }),
        intake(1, { calories: 2000 }),
      ])

      // Deux journées à l'équilibre : la moyenne, 2 200 kcal, dépasse le besoin
      // d'aujourd'hui, mais aucun jour n'a été en excès.
      expect(nutrients.calories.average).toBe(2200)
      expect(nutrients.calories.base).toBe(2000)
      expect(nutrients.calories.gap).toBe(0)
    })

    it('refuse un repère invalide dans la période', () => {
      const broken = (day: DayKey): NutrientValues =>
        day === daysAgo(5) ? { ...base, calories: -1 } : base

      expect(isErr(RecentIntakeService.summarize(today, broken, []))).toBe(true)
    })
  })

  describe('validation', () => {
    it('refuse une cible calorique nulle', () => {
      const result = RecentIntakeService.summarize(today, () => ({ ...base, calories: 0 }), [])

      expect(isErr(result)).toBe(true)
      if (!result.ok) expect(result.error.code).toBe('INVALID_NUTRITIONAL_NEEDS')
    })

    it('refuse un repère négatif ou non fini', () => {
      expect(isErr(RecentIntakeService.summarize(today, () => ({ ...base, saltG: -1 }), []))).toBe(true)
      expect(isErr(RecentIntakeService.summarize(today, () => ({ ...base, fiberG: NaN }), []))).toBe(true)
    })
  })
})
