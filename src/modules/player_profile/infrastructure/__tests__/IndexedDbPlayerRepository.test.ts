import { beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseProvider } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { idFrom } from '@/core/identity'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'
import {
  DietaryPreferences,
  DietaryRestriction,
} from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { IndexedDbPlayerRepository } from '@/modules/player_profile/infrastructure/IndexedDbPlayerRepository'

let databases: DatabaseProvider
let repository: IndexedDbPlayerRepository

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

const measurements = BodyMeasurements.reconstitute({
  heightCm: 180,
  weightKg: 80,
  ageYears: 30,
  biologicalSex: BiologicalSex.MALE,
})

const playerOf = (name = 'Perceval'): Player =>
  unwrap(
    Player.create({
      name,
      measurements,
      activityLevel: ActivityLevel.MODERATE,
      preferences: unwrap(
        DietaryPreferences.create({
          restrictions: [DietaryRestriction.GLUTEN_FREE],
          allergens: ['arachide'],
        }),
      ),
    }),
  )

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbPlayerRepository(databases)
})

describe('IndexedDbPlayerRepository', () => {
  describe('aller-retour Entité ↔ stockage', () => {
    it('restitue un profil complet', async () => {
      const player = playerOf()
      unwrap(await repository.save(player))

      const found = unwrap(await repository.findById(player.id))

      expect(found?.name).toBe('Perceval')
      expect(found?.measurements.equals(measurements)).toBe(true)
      expect(found?.activityLevel).toBe(ActivityLevel.MODERATE)
      expect(found?.preferences.has(DietaryRestriction.GLUTEN_FREE)).toBe(true)
      expect(found?.preferences.isAllergicTo('arachide')).toBe(true)
    })

    it('restitue un profil dont les calculs métaboliques sont identiques', async () => {
      const player = playerOf()
      unwrap(await repository.save(player))

      const found = unwrap(await repository.findById(player.id))

      expect(found?.basalMetabolicRate()).toBe(player.basalMetabolicRate())
      expect(found?.targetCalories()).toBe(player.targetCalories())
    })

    it('restitue un profil sans préférence', async () => {
      const player = unwrap(
        Player.create({
          name: 'Karadoc',
          measurements,
          activityLevel: ActivityLevel.SEDENTARY,
        }),
      )
      unwrap(await repository.save(player))

      const found = unwrap(await repository.findById(player.id))

      expect(found?.preferences.isEmpty).toBe(true)
    })

    it('retourne null pour un identifiant inconnu', async () => {
      expect(unwrap(await repository.findById(idFrom('inconnu')))).toBeNull()
    })
  })

  describe('profil courant', () => {
    it('est absent tant qu’aucun profil n’a été enregistré', async () => {
      expect(unwrap(await repository.findCurrent())).toBeNull()
    })

    it('désigne le profil enregistré comme courant', async () => {
      const player = playerOf()
      unwrap(await repository.save(player))

      const current = unwrap(await repository.findCurrent())

      expect(current?.id).toBe(player.id)
    })

    it('suit le dernier profil enregistré', async () => {
      unwrap(await repository.save(playerOf('Perceval')))
      const second = playerOf('Karadoc')
      unwrap(await repository.save(second))

      const current = unwrap(await repository.findCurrent())

      expect(current?.id).toBe(second.id)
      expect(current?.name).toBe('Karadoc')
    })

    it('met à jour le profil courant sans créer de doublon', async () => {
      const player = playerOf()
      unwrap(await repository.save(player))
      unwrap(await repository.save(unwrap(player.updateWeight(90))))

      const current = unwrap(await repository.findCurrent())

      expect(current?.measurements.weightKg).toBe(90)
      expect(current?.id).toBe(player.id)
    })
  })

  describe('suppression', () => {
    it('supprime le profil et le pointeur qui le désigne', async () => {
      const player = playerOf()
      unwrap(await repository.save(player))

      unwrap(await repository.delete(player.id))

      expect(unwrap(await repository.findById(player.id))).toBeNull()
      // Le pointeur ne doit pas survivre au profil : sinon `findCurrent` lirait
      // indéfiniment un identifiant qui ne correspond plus à rien.
      expect(unwrap(await repository.findCurrent())).toBeNull()
    })

    it('conserve le pointeur quand un autre profil est supprimé', async () => {
      const kept = playerOf('Perceval')
      unwrap(await repository.save(kept))
      const other = playerOf('Karadoc')
      unwrap(await repository.save(other))
      // `other` est désormais le courant ; on supprime `kept`.
      unwrap(await repository.delete(kept.id))

      const current = unwrap(await repository.findCurrent())

      expect(current?.id).toBe(other.id)
    })

    it('supprimer un profil absent ne lève pas', async () => {
      const result = await repository.delete(idFrom('inconnu'))

      expect(result.ok).toBe(true)
    })
  })

  it('convertit une panne de stockage en Result en échec', async () => {
    await databases.close()
    globalThis.indexedDB = undefined as unknown as IDBFactory

    const result = await repository.findCurrent()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('repository')
  })
})
