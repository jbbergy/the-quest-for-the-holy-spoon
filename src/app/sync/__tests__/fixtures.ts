import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'

import { DatabaseProvider, openHolySpoonDatabase } from '@/core/infrastructure/database'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { Quantity } from '@/core/nutrition/Quantity'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'
import { IndexedDbFoodRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFoodRepository'
import { IndexedDbMealRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbMealRepository'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex, BodyMeasurements } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { IndexedDbPlayerRepository } from '@/modules/player_profile/infrastructure/IndexedDbPlayerRepository'

import { IndexedDbReplica } from '../IndexedDbReplica'

export const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

/**
 * Un « appareil » : sa propre base IndexedDB, isolée des autres, et les
 * repositories réels qui l'alimentent. Deux appareils créés l'un après l'autre
 * ne partagent rien, comme deux navigateurs.
 */
export function createDevice() {
  const factory = new IDBFactory()
  const databases = new DatabaseProvider(() => {
    globalThis.indexedDB = factory
    return openHolySpoonDatabase()
  })
  return {
    databases,
    players: new IndexedDbPlayerRepository(databases),
    meals: new IndexedDbMealRepository(databases),
    foods: new IndexedDbFoodRepository(databases),
    replica: new IndexedDbReplica(databases),
  }
}

export type Device = ReturnType<typeof createDevice>

export const playerOf = (id: string, weightKg = 70): Player =>
  Player.reconstitute({
    id: idFrom<'PlayerId'>(id),
    name: 'Camille',
    measurements: BodyMeasurements.reconstitute({
      heightCm: 168,
      weightKg,
      ageYears: 34,
      biologicalSex: BiologicalSex.FEMALE,
    }),
    activityLevel: ActivityLevel.MODERATE,
    preferences: DietaryPreferences.none(),
  })

const bread = FoodItem.reconstitute({
  id: idFrom('ciqual:7001'),
  name: 'Baguette',
  macrosPer100g: Macros.reconstitute({ proteinG: 9, carbsG: 56, fatG: 1.5 }),
  source: FoodSource.CIQUAL,
})

export const mealOf = (playerId: string, grams = 100, id?: string): Meal =>
  unwrap(
    Meal.create({
      playerId: idFrom<'PlayerId'>(playerId) as PlayerId,
      type: MealType.LUNCH,
      loggedAt: new Date('2026-09-23T12:00:00'),
      entries: [unwrap(MealEntry.fromFoodItem(bread, Quantity.reconstitute(grams)))],
      ...(id === undefined ? {} : { id: idFrom<'MealId'>(id) }),
    }),
  )

export const customFoodOf = (id: string, source: FoodSource = FoodSource.USER): FoodItem =>
  FoodItem.reconstitute({
    id: idFrom(id),
    name: 'Houmous maison',
    macrosPer100g: Macros.reconstitute({ proteinG: 8, carbsG: 14, fatG: 17 }),
    source,
  })
