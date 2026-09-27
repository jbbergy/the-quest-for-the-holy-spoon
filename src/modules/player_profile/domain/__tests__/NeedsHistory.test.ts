import { describe, expect, it } from 'vitest'

import type { DayKey } from '@/core/day'
import {
  NEEDS_HISTORY_DAYS,
  NeedsHistory,
  type NeedsValues,
} from '@/modules/player_profile/domain/NeedsHistory'

const needsOf = (targetCalories: number): NeedsValues => ({
  targetCalories,
  targetMacros: { proteinG: 100, carbsG: 250, fatG: 70 },
  referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 25, saltG: 5 },
})

const today = '2026-09-27' as DayKey

describe('NeedsHistory', () => {
  it('garde les anciens besoins jusqu’à la veille', () => {
    const history = NeedsHistory.record([], needsOf(2400), today)

    expect(history).toEqual([{ ...needsOf(2400), until: '2026-09-26' }])
    expect(NeedsHistory.on(history, '2026-09-26' as DayKey, needsOf(2000)).targetCalories).toBe(
      2400,
    )
    expect(NeedsHistory.on(history, today, needsOf(2000)).targetCalories).toBe(2000)
  })

  it('ne retient que la première modification d’une même journée', () => {
    const once = NeedsHistory.record([], needsOf(2400), today)
    const twice = NeedsHistory.record(once, needsOf(2200), today)

    // Hier, les besoins étaient ceux d'avant la première modification.
    expect(twice).toEqual(once)
  })

  it('prend la première période qui couvre le jour', () => {
    const first = NeedsHistory.record([], needsOf(2600), '2026-09-20' as DayKey)
    const history = NeedsHistory.record(first, needsOf(2400), today)

    const on = (day: string) => NeedsHistory.on(history, day as DayKey, needsOf(2000))
    expect(on('2026-09-18').targetCalories).toBe(2600)
    expect(on('2026-09-19').targetCalories).toBe(2600)
    expect(on('2026-09-22').targetCalories).toBe(2400)
    expect(on('2026-09-28').targetCalories).toBe(2000)
  })

  it('oublie ce qui sort de la fenêtre gardée', () => {
    const old = NeedsHistory.record([], needsOf(2600), '2026-07-01' as DayKey)
    const history = NeedsHistory.record(old, needsOf(2400), today)

    expect(history).toHaveLength(1)
    expect(NEEDS_HISTORY_DAYS).toBeGreaterThanOrEqual(7)
  })

  it('compare deux jeux de besoins au centième', () => {
    expect(NeedsHistory.same(needsOf(2000), needsOf(2000.001))).toBe(true)
    expect(NeedsHistory.same(needsOf(2000), needsOf(2001))).toBe(false)
  })
})
