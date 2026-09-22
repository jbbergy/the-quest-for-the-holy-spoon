import { describe, expect, it } from 'vitest'

import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { isErr, isOk } from '@/core/result'
import {
  ActivityLevel,
  activityMultiplier,
} from '@/modules/player_profile/domain/ActivityLevel'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'
import {
  DietaryPreferences,
  DietaryRestriction,
} from '@/modules/player_profile/domain/DietaryPreferences'
import {
  BALANCED_MACRO_SPLIT,
  DAILY_FIBER_TARGET_G,
  DAILY_SALT_LIMIT_G,
  DAILY_SUGARS_LIMIT_G,
  SATURATED_FAT_ENERGY_SHARE,
} from '@/modules/player_profile/domain/BalancedDiet'
import { Player } from '@/modules/player_profile/domain/Player'

const measurements = BodyMeasurements.reconstitute({
  heightCm: 180,
  weightKg: 80,
  ageYears: 30,
  biologicalSex: BiologicalSex.MALE,
})

const playerOf = (overrides: Partial<Parameters<typeof Player.create>[0]> = {}): Player => {
  const result = Player.create({
    name: 'Perceval',
    measurements,
    activityLevel: ActivityLevel.MODERATE,
    ...overrides,
  })
  if (!isOk(result)) throw new Error('joueur de test invalide')
  return result.value
}

describe('Player', () => {
  describe('create', () => {
    it('crée un joueur avec des préférences vides par défaut', () => {
      const player = playerOf()

      expect(player.name).toBe('Perceval')
      expect(player.preferences.isEmpty).toBe(true)
      expect(player.id).toBeTypeOf('string')
    })

    it('normalise le nom', () => {
      expect(playerOf({ name: '  Perceval  ' }).name).toBe('Perceval')
    })

    it.each(['', '   '])('refuse un nom vide (%p)', (name) => {
      const result = Player.create({
        name,
        measurements,
        activityLevel: ActivityLevel.MODERATE,
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_PLAYER')
    })

    it('refuse un nom trop long', () => {
      const result = Player.create({
        name: 'a'.repeat(61),
        measurements,
        activityLevel: ActivityLevel.MODERATE,
      })

      expect(isErr(result)).toBe(true)
    })
  })

  describe('calculs énergétiques', () => {
    it('délègue le BMR aux mesures corporelles', () => {
      expect(playerOf().basalMetabolicRate()).toBeCloseTo(1780, 10)
    })

    it('pondère le BMR par le niveau d’activité pour obtenir le TDEE', () => {
      const player = playerOf({ activityLevel: ActivityLevel.MODERATE })

      expect(player.totalDailyEnergyExpenditure()).toBeCloseTo(1780 * 1.55, 10)
    })

    it.each(Object.values(ActivityLevel))('applique le multiplicateur de %s', (level) => {
      const player = playerOf({ activityLevel: level })

      expect(player.totalDailyEnergyExpenditure()).toBeCloseTo(
        1780 * activityMultiplier(level),
        10,
      )
    })

    it.each(Object.values(ActivityLevel))(
      'vise la dépense énergétique, sans écart, quelle que soit l’activité (%s)',
      (level) => {
        // Le test qui verrouille l'intention de l'application : ni déficit, ni
        // surplus. Introduire un facteur d'objectif le ferait échouer.
        const player = playerOf({ activityLevel: level })

        expect(player.targetCalories()).toBe(player.totalDailyEnergyExpenditure())
      },
    )
  })

  describe('targetMacros', () => {
    it.each(Object.values(ActivityLevel))(
      'répartit la cible calorique sans en perdre (%s)',
      (level) => {
        const player = playerOf({ activityLevel: level })
        const macros = player.targetMacros()

        expect(macros.calories()).toBeCloseTo(player.targetCalories(), 6)
      },
    )

    it('convertit chaque part en grammes via les coefficients d’Atwater', () => {
      const player = playerOf()
      const calories = player.targetCalories()

      expect(player.targetMacros().proteinG).toBeCloseTo(
        (calories * BALANCED_MACRO_SPLIT.protein) / KCAL_PER_GRAM.protein,
        10,
      )
      expect(player.targetMacros().fatG).toBeCloseTo(
        (calories * BALANCED_MACRO_SPLIT.fat) / KCAL_PER_GRAM.fat,
        10,
      )
    })

    it('répartit exactement 100 % de l’apport énergétique', () => {
      // Sans cette somme, `targetMacros` perdrait ou inventerait des calories
      // par rapport à `targetCalories` — l'écart passerait inaperçu à l'écran.
      const { protein, carbs, fat } = BALANCED_MACRO_SPLIT

      expect(protein + carbs + fat).toBeCloseTo(1, 10)
    })

    it('reste dans les fourchettes de référence de l’ANSES', () => {
      const { protein, carbs, fat } = BALANCED_MACRO_SPLIT

      expect(protein).toBeGreaterThanOrEqual(0.1)
      expect(protein).toBeLessThanOrEqual(0.2)
      expect(carbs).toBeGreaterThanOrEqual(0.4)
      expect(carbs).toBeLessThanOrEqual(0.55)
      expect(fat).toBeGreaterThanOrEqual(0.35)
      expect(fat).toBeLessThanOrEqual(0.4)
    })
  })

  describe('referenceNutrients', () => {
    it('reprend les repères fixes de l’ANSES et du PNNS', () => {
      const reference = playerOf().referenceNutrients()

      expect(reference.fiberG).toBe(DAILY_FIBER_TARGET_G)
      expect(reference.sugarsG).toBe(DAILY_SUGARS_LIMIT_G)
      expect(reference.saltG).toBe(DAILY_SALT_LIMIT_G)
    })

    it('dérive le plafond d’AG saturés de la dépense énergétique', () => {
      const player = playerOf()

      expect(player.referenceNutrients().saturatedFatG).toBeCloseTo(
        (player.targetCalories() * SATURATED_FAT_ENERGY_SHARE) / KCAL_PER_GRAM.fat,
        9,
      )
    })

    it.each(Object.values(ActivityLevel))(
      'ne fait varier que les AG saturés d’un niveau d’activité à l’autre (%s)',
      (level) => {
        const sedentary = playerOf({ activityLevel: ActivityLevel.SEDENTARY })
        const other = playerOf({ activityLevel: level })

        // Fibres, sucres et sel sont des repères de population : ils ne
        // dépendent ni du corps ni du rythme de vie. Seuls les AG saturés,
        // exprimés en part de l'énergie, suivent la dépense.
        expect(other.referenceNutrients().fiberG).toBe(sedentary.referenceNutrients().fiberG)
        expect(other.referenceNutrients().sugarsG).toBe(sedentary.referenceNutrients().sugarsG)
        expect(other.referenceNutrients().saltG).toBe(sedentary.referenceNutrients().saltG)

        const varies = level !== ActivityLevel.SEDENTARY
        expect(
          other.referenceNutrients().saturatedFatG >
            sedentary.referenceNutrients().saturatedFatG,
        ).toBe(varies)
      },
    )
  })

  describe('immutabilité', () => {
    it('updateWeight retourne un nouveau joueur et recalcule le BMR', () => {
      const original = playerOf()
      const updated = original.updateWeight(90)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) {
        expect(updated.value).not.toBe(original)
        expect(updated.value.id).toBe(original.id)
        expect(updated.value.measurements.weightKg).toBe(90)
        // +10 kg ⇒ +100 kcal de BMR (coefficient 10 de Mifflin-St Jeor).
        expect(updated.value.basalMetabolicRate()).toBeCloseTo(
          original.basalMetabolicRate() + 100,
          10,
        )
      }
      expect(original.measurements.weightKg).toBe(80)
    })

    it('updateWeight propage l’erreur de bornes sans altérer le joueur', () => {
      const original = playerOf()

      const result = original.updateWeight(5)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEASUREMENT')
      expect(original.measurements.weightKg).toBe(80)
    })

    it.each([
      ['withActivityLevel', (p: Player) => p.withActivityLevel(ActivityLevel.VERY_ACTIVE)],
      ['withPreferences', (p: Player) => p.withPreferences(DietaryPreferences.none())],
      [
        'withMeasurements',
        (p: Player) => p.withMeasurements(BodyMeasurements.reconstitute({
          heightCm: 170,
          weightKg: 70,
          ageYears: 40,
          biologicalSex: BiologicalSex.FEMALE,
        })),
      ],
    ])('%s retourne une nouvelle instance et conserve l’identifiant', (_label, mutate) => {
      const original = playerOf()
      const updated = mutate(original)

      expect(updated).not.toBe(original)
      expect(updated.id).toBe(original.id)
    })

    it('withActivityLevel change la cible sans toucher à l’original', () => {
      const original = playerOf({ activityLevel: ActivityLevel.MODERATE })
      const before = original.targetCalories()

      const active = original.withActivityLevel(ActivityLevel.VERY_ACTIVE)

      expect(active.targetCalories()).toBeGreaterThan(before)
      expect(original.targetCalories()).toBe(before)
      expect(original.activityLevel).toBe(ActivityLevel.MODERATE)
    })

    it('rename conserve tout le reste et valide le nouveau nom', () => {
      const prefs = DietaryPreferences.reconstitute({
        restrictions: [DietaryRestriction.VEGAN],
        allergens: [],
      })
      const original = playerOf({ preferences: prefs })

      const renamed = original.rename('Karadoc')

      expect(isOk(renamed)).toBe(true)
      if (isOk(renamed)) {
        expect(renamed.value.name).toBe('Karadoc')
        expect(renamed.value.id).toBe(original.id)
        expect(renamed.value.preferences.has(DietaryRestriction.VEGAN)).toBe(true)
      }
      expect(original.name).toBe('Perceval')
      expect(isErr(original.rename('   '))).toBe(true)
    })
  })

  it('compare par identité', () => {
    const a = playerOf()
    const b = playerOf()

    expect(a.equals(a.withActivityLevel(ActivityLevel.VERY_ACTIVE))).toBe(true)
    expect(a.equals(b)).toBe(false)
  })

  it('se réhydrate sans revalider', () => {
    const player = Player.reconstitute({
      id: '00000000-0000-0000-0000-000000000000' as Player['id'],
      name: 'Perceval',
      measurements,
      activityLevel: ActivityLevel.SEDENTARY,
      preferences: DietaryPreferences.none(),
    })

    expect(player.name).toBe('Perceval')
    expect(player.targetCalories()).toBeCloseTo(1780 * 1.2, 10)
  })
})
