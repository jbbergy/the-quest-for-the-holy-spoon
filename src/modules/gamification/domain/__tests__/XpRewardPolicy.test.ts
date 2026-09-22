import { describe, expect, it } from 'vitest'

import {
  type MealLoggedFacts,
  XP_RULES,
  XpRewardPolicy,
} from '@/modules/gamification/domain/XpRewardPolicy'

const facts = (overrides: Partial<MealLoggedFacts> = {}): MealLoggedFacts => ({
  entryCount: 1,
  calories: 500,
  macros: { proteinG: 30, carbsG: 50, fatG: 15 },
  ...overrides,
})

describe('XpRewardPolicy', () => {
  it('récompense un repas simple et équilibré', () => {
    const xp = XpRewardPolicy.xpForMealLogged(facts())

    expect(xp.value).toBe(XP_RULES.baseMealXp + XP_RULES.perEntryXp + XP_RULES.balancedMealXp)
  })

  it('ne récompense pas un repas sans ligne', () => {
    expect(XpRewardPolicy.xpForMealLogged(facts({ entryCount: 0 })).isZero).toBe(true)
  })

  it('ne récompense pas un repas sans calorie', () => {
    expect(XpRewardPolicy.xpForMealLogged(facts({ calories: 0 })).isZero).toBe(true)
  })

  it('bonifie la variété des aliments', () => {
    const one = XpRewardPolicy.xpForMealLogged(facts({ entryCount: 1 }))
    const three = XpRewardPolicy.xpForMealLogged(facts({ entryCount: 3 }))

    expect(three.value).toBe(one.value + 2 * XP_RULES.perEntryXp)
  })

  it('plafonne le bonus de variété pour décourager le remplissage', () => {
    const atCap = XpRewardPolicy.xpForMealLogged(facts({ entryCount: 5 }))
    const beyondCap = XpRewardPolicy.xpForMealLogged(facts({ entryCount: 40 }))

    expect(atCap.value).toBe(beyondCap.value)
    expect(beyondCap.value).toBe(
      XP_RULES.baseMealXp + XP_RULES.maxEntryBonus + XP_RULES.balancedMealXp,
    )
  })

  it.each([
    ['sans protéines', { proteinG: 0, carbsG: 50, fatG: 15 }],
    ['sans glucides', { proteinG: 30, carbsG: 0, fatG: 15 }],
    ['sans lipides', { proteinG: 30, carbsG: 50, fatG: 0 }],
  ])('n’accorde pas le bonus d’équilibre à un repas %s', (_label, macros) => {
    const xp = XpRewardPolicy.xpForMealLogged(facts({ macros }))

    expect(xp.value).toBe(XP_RULES.baseMealXp + XP_RULES.perEntryXp)
  })

  it('est déterministe', () => {
    const input = facts({ entryCount: 4 })

    expect(XpRewardPolicy.xpForMealLogged(input).value).toBe(
      XpRewardPolicy.xpForMealLogged(input).value,
    )
  })

  it('accepte n’importe quelle structure conforme, sans connaître Meal', () => {
    // La politique ne reçoit que des faits : aucun objet du contexte nutrition
    // n'a besoin d'exister pour la tester.
    const xp = XpRewardPolicy.xpForMealLogged({
      entryCount: 2,
      calories: 300,
      macros: { proteinG: 1, carbsG: 1, fatG: 1 },
    })

    expect(xp.value).toBeGreaterThan(0)
  })
})
