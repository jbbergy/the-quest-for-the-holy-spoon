import { describe, expect, it } from 'vitest'

import type { DayKey } from '@/core/day'
import { copyDay } from '@/modules/nutrition_inventory/presentation/mealDraft'

const day = (value: string) => value as DayKey

describe('copyDay', () => {
  it('ramène à aujourd’hui la copie d’un repas passé', () => {
    expect(copyDay(day('2026-09-28'), day('2026-10-02'))).toBe('2026-10-02')
  })

  it('place au lendemain la copie d’un repas du jour', () => {
    expect(copyDay(day('2026-10-02'), day('2026-10-02'))).toBe('2026-10-03')
  })

  it('place au lendemain la copie d’un repas à venir, même en fin de mois', () => {
    expect(copyDay(day('2026-10-31'), day('2026-10-02'))).toBe('2026-11-01')
  })
})
