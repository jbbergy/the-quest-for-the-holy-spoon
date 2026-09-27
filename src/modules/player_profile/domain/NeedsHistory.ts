import { addDays, type DayKey } from '@/core/day'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'

/**
 * Besoins en vigueur **jusqu'à** un jour donné, inclus.
 *
 * Changer de poids ou d'activité change les besoins à partir d'aujourd'hui,
 * pas ceux d'hier : une journée passée reste jugée avec les besoins qu'on
 * avait ce jour-là. Sans cet historique, perdre cinq kilos transformerait
 * après coup une semaine équilibrée en semaine d'excès.
 */
export interface NeedsSnapshot {
  readonly until: DayKey
  readonly targetCalories: number
  readonly targetMacros: MacrosProps
  readonly referenceNutrients: NutrientDetailProps
}

export type NeedsValues = Omit<NeedsSnapshot, 'until'>

/**
 * Durée gardée. Les moyennes ne regardent que la semaine écoulée ; un mois
 * laisse de la marge sans faire grossir le profil à chaque pesée.
 */
export const NEEDS_HISTORY_DAYS = 31

export const NeedsHistory = {
  /**
   * Les besoins d'un jour : ceux de la première période qui le couvre — la
   * plus ancienne pour un jour d'avant l'historique, faute de mieux —, ou les
   * besoins actuels pour un jour postérieur à toutes.
   */
  on(history: readonly NeedsSnapshot[], day: DayKey, current: NeedsValues): NeedsValues {
    const covering = history.find((snapshot) => snapshot.until >= day)
    if (covering === undefined) return current
    return {
      targetCalories: covering.targetCalories,
      targetMacros: covering.targetMacros,
      referenceNutrients: covering.referenceNutrients,
    }
  },

  /**
   * Ajoute les besoins `previous`, en vigueur jusqu'à la veille de `today`.
   *
   * Plusieurs modifications le même jour n'en ajoutent qu'une : les besoins
   * d'hier sont ceux d'avant la **première** d'entre elles. Les périodes
   * sorties de la fenêtre gardée sont retirées au passage.
   */
  record(
    history: readonly NeedsSnapshot[],
    previous: NeedsValues,
    today: DayKey,
  ): readonly NeedsSnapshot[] {
    const yesterday = addDays(today, -1)
    const oldest = addDays(today, -NEEDS_HISTORY_DAYS)
    const kept = history.filter((snapshot) => snapshot.until >= oldest)
    const last = kept.at(-1)
    if (last !== undefined && last.until >= yesterday) return kept
    return [...kept, { ...previous, until: yesterday }]
  },

  /** Deux jeux de besoins égaux au centième : une nouvelle période serait sans objet. */
  same(a: NeedsValues, b: NeedsValues): boolean {
    const values = (needs: NeedsValues) => [
      needs.targetCalories,
      needs.targetMacros.proteinG,
      needs.targetMacros.carbsG,
      needs.targetMacros.fatG,
      needs.referenceNutrients.fiberG,
      needs.referenceNutrients.sugarsG,
      needs.referenceNutrients.saturatedFatG,
      needs.referenceNutrients.saltG,
    ]
    const left = values(a)
    const right = values(b)
    return left.every((value, index) => Math.abs(value - (right[index] ?? 0)) < 0.01)
  },
} as const
