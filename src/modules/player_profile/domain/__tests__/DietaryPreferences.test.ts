import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '@/core/result'
import {
  DietaryPreferences,
  DietaryRestriction,
} from '@/modules/player_profile/domain/DietaryPreferences'

const unwrap = (result: ReturnType<typeof DietaryPreferences.create>): DietaryPreferences => {
  if (!isOk(result)) throw new Error('préférences de test invalides')
  return result.value
}

describe('DietaryPreferences', () => {
  describe('create', () => {
    it('crée des préférences vides par défaut', () => {
      const prefs = unwrap(DietaryPreferences.create())

      expect(prefs.isEmpty).toBe(true)
      expect(prefs.restrictions).toEqual([])
      expect(prefs.allergens).toEqual([])
    })

    it('déduplique et ordonne les restrictions', () => {
      const prefs = unwrap(
        DietaryPreferences.create({
          restrictions: [
            DietaryRestriction.VEGAN,
            DietaryRestriction.GLUTEN_FREE,
            DietaryRestriction.VEGAN,
          ],
        }),
      )

      expect(prefs.restrictions).toEqual([
        DietaryRestriction.GLUTEN_FREE,
        DietaryRestriction.VEGAN,
      ])
    })

    it('normalise les allergènes : casse, espaces, doublons, entrées vides', () => {
      const prefs = unwrap(
        DietaryPreferences.create({
          allergens: ['  Arachide ', 'arachide', 'NOISETTE', '   ', ''],
        }),
      )

      expect(prefs.allergens).toEqual(['arachide', 'noisette'])
    })

    it.each([
      [DietaryRestriction.VEGAN, DietaryRestriction.PESCATARIAN],
      [DietaryRestriction.VEGETARIAN, DietaryRestriction.PESCATARIAN],
    ])('refuse la combinaison incompatible %s + %s', (a, b) => {
      const result = DietaryPreferences.create({ restrictions: [a, b] })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INCOMPATIBLE_DIETARY_RESTRICTION')
    })

    it('accepte végétarien + végan, qui ne se contredisent pas', () => {
      const result = DietaryPreferences.create({
        restrictions: [DietaryRestriction.VEGETARIAN, DietaryRestriction.VEGAN],
      })

      expect(isOk(result)).toBe(true)
    })

    it('refuse une liste d’allergènes déraisonnable', () => {
      const allergens = Array.from({ length: 51 }, (_, i) => `allergene-${i}`)

      expect(isErr(DietaryPreferences.create({ allergens }))).toBe(true)
    })
  })

  describe('interrogation', () => {
    it('détecte une restriction', () => {
      const prefs = unwrap(
        DietaryPreferences.create({ restrictions: [DietaryRestriction.GLUTEN_FREE] }),
      )

      expect(prefs.has(DietaryRestriction.GLUTEN_FREE)).toBe(true)
      expect(prefs.has(DietaryRestriction.VEGAN)).toBe(false)
    })

    it('détecte une allergie quelle que soit la casse saisie', () => {
      const prefs = unwrap(DietaryPreferences.create({ allergens: ['Arachide'] }))

      expect(prefs.isAllergicTo('ARACHIDE')).toBe(true)
      expect(prefs.isAllergicTo('  arachide  ')).toBe(true)
      expect(prefs.isAllergicTo('soja')).toBe(false)
    })
  })

  describe('immutabilité', () => {
    it('with ajoute une restriction dans une nouvelle instance', () => {
      const original = DietaryPreferences.none()
      const updated = original.with(DietaryRestriction.VEGAN)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) {
        expect(updated.value).not.toBe(original)
        expect(updated.value.has(DietaryRestriction.VEGAN)).toBe(true)
      }
      expect(original.isEmpty).toBe(true)
    })

    it('with refuse une restriction contradictoire avec l’existant', () => {
      const vegan = unwrap(DietaryPreferences.create({ restrictions: [DietaryRestriction.VEGAN] }))

      const result = vegan.with(DietaryRestriction.PESCATARIAN)

      expect(isErr(result)).toBe(true)
      expect(vegan.has(DietaryRestriction.PESCATARIAN)).toBe(false)
    })

    it('without retire une restriction dans une nouvelle instance', () => {
      const original = unwrap(
        DietaryPreferences.create({
          restrictions: [DietaryRestriction.VEGAN, DietaryRestriction.GLUTEN_FREE],
        }),
      )

      const updated = original.without(DietaryRestriction.VEGAN)

      expect(updated).not.toBe(original)
      expect(updated.has(DietaryRestriction.VEGAN)).toBe(false)
      expect(updated.has(DietaryRestriction.GLUTEN_FREE)).toBe(true)
      expect(original.has(DietaryRestriction.VEGAN)).toBe(true)
    })

    it('without sur une restriction absente est sans effet', () => {
      const original = DietaryPreferences.none()

      expect(original.without(DietaryRestriction.VEGAN).isEmpty).toBe(true)
    })

    it('withAllergen normalise et ne mute pas', () => {
      const original = DietaryPreferences.none()
      const updated = original.withAllergen('  Soja ')

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) expect(updated.value.allergens).toEqual(['soja'])
      expect(original.allergens).toEqual([])
    })

    it('expose des listes gelées', () => {
      const prefs = unwrap(DietaryPreferences.create({ restrictions: [DietaryRestriction.VEGAN] }))

      expect(Object.isFrozen(prefs.restrictions)).toBe(true)
      expect(Object.isFrozen(prefs.allergens)).toBe(true)
    })
  })

  it('compare par valeur', () => {
    const a = unwrap(DietaryPreferences.create({ restrictions: [DietaryRestriction.VEGAN] }))
    const b = unwrap(DietaryPreferences.create({ restrictions: [DietaryRestriction.VEGAN] }))
    const c = unwrap(DietaryPreferences.create({ restrictions: [DietaryRestriction.GLUTEN_FREE] }))

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
    expect(a.equals(DietaryPreferences.none())).toBe(false)
  })

  it('se réhydrate sans revalider ni renormaliser', () => {
    const prefs = DietaryPreferences.reconstitute({
      restrictions: [DietaryRestriction.VEGAN],
      allergens: ['arachide'],
    })

    expect(prefs.has(DietaryRestriction.VEGAN)).toBe(true)
    expect(prefs.isAllergicTo('arachide')).toBe(true)
  })

  it('sérialise en objet nu', () => {
    const prefs = unwrap(
      DietaryPreferences.create({
        restrictions: [DietaryRestriction.VEGAN],
        allergens: ['Soja'],
      }),
    )

    expect(prefs.toJSON()).toEqual({
      restrictions: [DietaryRestriction.VEGAN],
      allergens: ['soja'],
    })
  })
})
