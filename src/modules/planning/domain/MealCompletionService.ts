import { InvalidNutritionalNeedsError } from '@/core/errors'
import { Macros, type MacrosProps } from '@/core/nutrition/Macros'
import { err, ok, type Result } from '@/core/result'

/**
 * Entrées du service, définies **localement et structurellement**.
 *
 * `planning` ne connaît ni `Player` ni `Meal` : il raisonne sur des cibles et des
 * consommations. La couche `application` du module adapte les read models des
 * autres contextes vers ces formes, ce qui rend ce service testable seul et
 * insensible aux évolutions internes de `player_profile` et `nutrition_inventory`.
 */
export interface DailyTarget {
  readonly calories: number
  readonly macros: MacrosProps
}

export interface ConsumedTotals {
  readonly calories: number
  readonly macros: MacrosProps
}

export const CompletionStatus = {
  /** Il reste une marge significative avant d'atteindre la cible. */
  ON_TRACK: 'ON_TRACK',
  /** La cible est atteinte, à la tolérance près. */
  COMPLETE: 'COMPLETE',
  /** La cible est dépassée. */
  EXCEEDED: 'EXCEEDED',
} as const
export type CompletionStatus = (typeof CompletionStatus)[keyof typeof CompletionStatus]

/**
 * Profil de l'aliment idéal pour combler l'écart restant.
 *
 * `remainingMacros` donne les grammes manquants ; `idealRatios` les exprime en
 * parts caloriques normalisées, la forme directement comparable au profil d'une
 * fiche du catalogue lors de la recherche.
 */
export interface IdealFoodProfile {
  readonly status: CompletionStatus
  readonly remainingCalories: number
  readonly remainingMacros: MacrosProps
  readonly idealRatios: { readonly protein: number; readonly carbs: number; readonly fat: number }
  readonly completionRatio: number
  readonly excessCalories: number
}

/** Au-delà de 98 % de la cible, on considère la journée faite. */
const COMPLETION_TOLERANCE = 0.98

/**
 * Détermine ce qu'il manque au joueur pour atteindre sa cible du jour.
 *
 * Service de domaine pur et sans état : aucune I/O, aucune dépendance, donc
 * entièrement testable par table de cas.
 */
export const MealCompletionService = {
  computeMissing(
    target: DailyTarget,
    consumed: readonly ConsumedTotals[],
  ): Result<IdealFoodProfile, InvalidNutritionalNeedsError> {
    const validation = validateTarget(target)
    if (validation !== null) return err(validation)

    const targetMacros = Macros.reconstitute(target.macros)
    const consumedMacros = consumed.reduce(
      (sum, entry) => sum.plus(Macros.reconstitute(entry.macros)),
      Macros.zero(),
    )
    const consumedCalories = consumed.reduce((sum, entry) => sum + entry.calories, 0)

    const remaining = targetMacros.minus(consumedMacros)
    const remainingCalories = Math.max(0, target.calories - consumedCalories)
    const completionRatio = consumedCalories / target.calories

    return ok({
      status: statusFor(completionRatio),
      remainingCalories,
      remainingMacros: remaining.toJSON(),
      idealRatios: caloricRatios(remaining),
      completionRatio,
      excessCalories: Math.max(0, consumedCalories - target.calories),
    })
  },
} as const

function validateTarget(target: DailyTarget): InvalidNutritionalNeedsError | null {
  if (!Number.isFinite(target.calories) || target.calories <= 0) {
    return new InvalidNutritionalNeedsError(
      `La cible calorique doit être strictement positive (reçu ${target.calories}).`,
    )
  }

  const { proteinG, carbsG, fatG } = target.macros
  for (const value of [proteinG, carbsG, fatG]) {
    if (!Number.isFinite(value) || value < 0) {
      return new InvalidNutritionalNeedsError(
        `Les macros cibles doivent être des nombres positifs (reçu ${value}).`,
      )
    }
  }

  return null
}

function statusFor(completionRatio: number): CompletionStatus {
  if (completionRatio > 1) return CompletionStatus.EXCEEDED
  if (completionRatio >= COMPLETION_TOLERANCE) return CompletionStatus.COMPLETE
  return CompletionStatus.ON_TRACK
}

/**
 * Parts caloriques du reste à consommer. Quand il ne reste rien, les trois parts
 * valent zéro : c'est un profil vide, et non une répartition arbitraire qui
 * ferait recommander un aliment au hasard.
 */
function caloricRatios(remaining: Macros): IdealFoodProfile['idealRatios'] {
  const calories = remaining.calories()
  if (calories === 0) return { protein: 0, carbs: 0, fat: 0 }

  return {
    protein: (remaining.proteinG * 4) / calories,
    carbs: (remaining.carbsG * 4) / calories,
    fat: (remaining.fatG * 9) / calories,
  }
}
