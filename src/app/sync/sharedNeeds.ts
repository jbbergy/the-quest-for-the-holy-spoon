import type { SharedNeeds } from '@/contract/sync'
import { toNutritionalNeeds } from '@/modules/player_profile/application'
import { type PlayerRecord, recordToPlayer } from '@/modules/player_profile/infrastructure/records'

/**
 * Besoins publiés, dérivés du profil au moment de l'envoi.
 *
 * Ils ne sont pas stockés sur l'appareil : chaque envoi du profil les
 * recalcule, si bien qu'ils ne peuvent pas diverger de lui. Seuls le nom et
 * ce qui découle des mensurations partent — pas les mensurations elles-mêmes.
 */
export function sharedNeedsOf(record: PlayerRecord): SharedNeeds {
  const needs = toNutritionalNeeds(recordToPlayer(record))
  return {
    id: needs.playerId,
    playerId: needs.playerId,
    name: record.name,
    targetCalories: needs.targetCalories,
    targetMacros: needs.targetMacros,
    referenceNutrients: needs.referenceNutrients,
    history: needs.history.map((snapshot) => ({ ...snapshot })),
  }
}
