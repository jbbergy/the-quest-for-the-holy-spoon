import { idFrom } from '@/core/identity'

import type { ActivityLevel } from '../domain/ActivityLevel'
import { type BiologicalSex, BodyMeasurements } from '../domain/BodyMeasurements'
import { DietaryPreferences, type DietaryRestriction } from '../domain/DietaryPreferences'
import { Player } from '../domain/Player'

/**
 * Enregistrement **à plat**.
 *
 * Aplatir les mesures plutôt que d'imbriquer un objet garde le format lisible
 * dans l'inspecteur du navigateur et dans l'export de données (phase 6), au prix
 * d'un mapper de quelques lignes.
 */
export interface PlayerRecord {
  readonly id: string
  readonly name: string
  readonly heightCm: number
  readonly weightKg: number
  readonly ageYears: number
  readonly biologicalSex: BiologicalSex
  readonly activityLevel: ActivityLevel
  readonly restrictions: readonly DietaryRestriction[]
  readonly allergens: readonly string[]
}

export function playerToRecord(player: Player): PlayerRecord {
  return {
    id: player.id,
    name: player.name,
    heightCm: player.measurements.heightCm,
    weightKg: player.measurements.weightKg,
    ageYears: player.measurements.ageYears,
    biologicalSex: player.measurements.biologicalSex,
    activityLevel: player.activityLevel,
    restrictions: [...player.preferences.restrictions],
    allergens: [...player.preferences.allergens],
  }
}

export function recordToPlayer(record: PlayerRecord): Player {
  return Player.reconstitute({
    id: idFrom(record.id),
    name: record.name,
    measurements: BodyMeasurements.reconstitute({
      heightCm: record.heightCm,
      weightKg: record.weightKg,
      ageYears: record.ageYears,
      biologicalSex: record.biologicalSex,
    }),
    activityLevel: record.activityLevel,
    preferences: DietaryPreferences.reconstitute({
      restrictions: record.restrictions,
      allergens: record.allergens,
    }),
  })
}
