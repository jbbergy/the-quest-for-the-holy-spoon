import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { FavoritePortion } from '@/modules/nutrition_inventory/domain/FavoritePortion'

const base = { playerId: idFrom<'PlayerId'>('player-1'), foodItemId: idFrom<'FoodItemId'>('ciqual:7200') }

describe('FavoritePortion', () => {
  it('garde une quantité en grammes et le nom de sa mesure', () => {
    const created = FavoritePortion.create({ ...base, grams: 50, measure: ' tranche ' })

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.quantity.grams).toBe(50)
    expect(created.value.measure).toBe('tranche')
  })

  it('refuse une quantité nulle ou une mesure sans nom', () => {
    expect(FavoritePortion.create({ ...base, grams: 0, measure: 'g' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FAVORITE_PORTION' },
    })
    expect(FavoritePortion.create({ ...base, grams: 50, measure: '  ' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FAVORITE_PORTION' },
    })
    expect(FavoritePortion.create({ ...base, grams: 50, measure: 'x'.repeat(41) }).ok).toBe(false)
  })

  it('reconnaît la même portion, au centième de gramme près', () => {
    const created = FavoritePortion.create({ ...base, grams: 37.5, measure: 'tranche' })
    if (!created.ok) throw created.error

    expect(created.value.isSameAs({ grams: 37.504, measure: 'tranche' })).toBe(true)
    expect(created.value.isSameAs({ grams: 37.5, measure: 'g' })).toBe(false)
    expect(created.value.isSameAs({ grams: 75, measure: 'tranche' })).toBe(false)
  })
})
