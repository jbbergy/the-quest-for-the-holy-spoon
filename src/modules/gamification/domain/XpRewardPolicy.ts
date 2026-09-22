import { XpAmount } from './XpAmount'

/**
 * Ce que le jeu a besoin de savoir d'un repas pour le récompenser.
 *
 * Type **structurel et local** : le domaine de `gamification` ne référence ni
 * l'entité `Meal`, ni même le payload d'événement de `nutrition_inventory`. Sa
 * couche `application` se charge de l'adaptation, et ce module reste testable
 * et déplaçable sans rien connaître du reste.
 */
export interface MealLoggedFacts {
  readonly entryCount: number
  readonly calories: number
  readonly macros: {
    readonly proteinG: number
    readonly carbsG: number
    readonly fatG: number
  }
}

export const XP_RULES = {
  /** Récompense de base pour avoir enregistré un repas. */
  baseMealXp: 10,
  /** Bonus par aliment distinct, plafonné : la variété est encouragée, pas le spam. */
  perEntryXp: 5,
  maxEntryBonus: 25,
  /** Bonus d'équilibre : les trois macronutriments sont représentés. */
  balancedMealXp: 15,
  /** Un repas sans aucune calorie n'est pas un repas. */
  minCaloriesForReward: 1,
} as const

/**
 * Barème d'XP. Fonction pure et déterministe, donc testable sans aucun montage.
 */
export const XpRewardPolicy = {
  xpForMealLogged(facts: MealLoggedFacts): XpAmount {
    if (facts.entryCount <= 0 || facts.calories < XP_RULES.minCaloriesForReward) {
      return XpAmount.zero()
    }

    const entryBonus = Math.min(
      facts.entryCount * XP_RULES.perEntryXp,
      XP_RULES.maxEntryBonus,
    )
    const balanceBonus = isBalanced(facts) ? XP_RULES.balancedMealXp : 0

    return XpAmount.reconstitute(XP_RULES.baseMealXp + entryBonus + balanceBonus)
  },
} as const

/** Un repas est « équilibré » quand aucun des trois macronutriments n'est absent. */
function isBalanced(facts: MealLoggedFacts): boolean {
  const { proteinG, carbsG, fatG } = facts.macros
  return proteinG > 0 && carbsG > 0 && fatG > 0
}
