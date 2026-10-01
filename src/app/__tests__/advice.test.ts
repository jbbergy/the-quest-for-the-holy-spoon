import { describe, expect, it } from 'vitest'

import { adviceFor } from '@/app/advice'
import { Diet } from '@/modules/nutrition_inventory/application'
import { CompletionStatus, type IdealFoodProfile } from '@/modules/planning/application'

const profile = (overrides: Partial<IdealFoodProfile> = {}): IdealFoodProfile => ({
  status: CompletionStatus.ON_TRACK,
  remainingCalories: 1890,
  remainingMacros: { proteinG: 87, carbsG: 193, fatG: 86 },
  remainingFiberG: 0,
  idealRatios: { protein: 0.2, carbs: 0.45, fat: 0.35 },
  completionRatio: 0.18,
  excessCalories: 0,
  ...overrides,
})

describe('adviceFor', () => {
  it('ne met en avant qu’un seul nutriment, avec des exemples', () => {
    expect(adviceFor(profile(), [])).toEqual([
      'Il vous reste 1\u202f890 kcal pour aujourd’hui.',
      'Il vous manque surtout des glucides\u00A0: 193 g.',
      'Par exemple\u00A0: pain, pâtes, riz, pommes de terre, fruits.',
    ])
  })

  it('choisit des exemples qui respectent le régime', () => {
    const lines = adviceFor(
      profile({ idealRatios: { protein: 0.6, carbs: 0.2, fat: 0.2 } }),
      [Diet.VEGAN],
    )

    expect(lines).toContain('Par exemple\u00A0: légumes secs, tofu.')
  })

  it('dit un dépassement sans juger, avec le vrai nombre', () => {
    const lines = adviceFor(
      profile({ status: CompletionStatus.EXCEEDED, remainingCalories: 0, excessCalories: 120 }),
      [],
    )

    expect(lines[0]).toBe('Vous avez mangé 120 kcal de plus que votre besoin.')
    expect(lines[1]).toContain('Ce n’est pas grave')
    expect(lines.join(' ')).not.toContain('0 kcal pour')
  })

  it('dit une journée complète, et les fibres qui manquent encore', () => {
    const lines = adviceFor(
      profile({ status: CompletionStatus.COMPLETE, remainingCalories: 20, remainingFiberG: 8.4 }),
      [Diet.GLUTEN_FREE],
    )

    expect(lines).toEqual([
      'Vous avez mangé ce dont vous avez besoin aujourd’hui.',
      'Il vous manque encore 8 g de fibres.',
      'Par exemple\u00A0: légumes, fruits, légumes secs.',
    ])
  })

  it('tait un manque trop petit pour valoir une phrase', () => {
    const lines = adviceFor(
      profile({ remainingMacros: { proteinG: 2, carbsG: 3, fatG: 1 }, remainingFiberG: 0.4 }),
      [],
    )

    expect(lines).toEqual(['Il vous reste 1\u202f890 kcal pour aujourd’hui.'])
  })
})
