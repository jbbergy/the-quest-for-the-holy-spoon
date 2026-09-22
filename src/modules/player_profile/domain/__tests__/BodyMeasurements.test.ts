import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '@/core/result'
import {
  BiologicalSex,
  BodyMeasurements,
} from '@/modules/player_profile/domain/BodyMeasurements'

const valid = {
  heightCm: 180,
  weightKg: 75,
  ageYears: 30,
  biologicalSex: BiologicalSex.MALE,
}

describe('BodyMeasurements', () => {
  describe('create', () => {
    it('accepte des mesures plausibles', () => {
      const result = BodyMeasurements.create(valid)

      expect(isOk(result)).toBe(true)
    })

    it.each([
      ['taille trop petite', { ...valid, heightCm: 49 }],
      ['taille trop grande', { ...valid, heightCm: 273 }],
      ['poids trop faible', { ...valid, weightKg: 19 }],
      ['poids trop élevé', { ...valid, weightKg: 641 }],
      ['âge trop bas', { ...valid, ageYears: 12 }],
      ['âge trop haut', { ...valid, ageYears: 121 }],
      ['taille NaN', { ...valid, heightCm: Number.NaN }],
      ['poids infini', { ...valid, weightKg: Number.POSITIVE_INFINITY }],
    ])('refuse : %s', (_label, props) => {
      const result = BodyMeasurements.create(props)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MEASUREMENT')
    })

    it.each([
      ['borne basse de taille', { ...valid, heightCm: 50 }],
      ['borne haute de taille', { ...valid, heightCm: 272 }],
      ['borne basse d’âge', { ...valid, ageYears: 13 }],
      ['borne haute d’âge', { ...valid, ageYears: 120 }],
      ['borne basse de poids', { ...valid, weightKg: 20 }],
      ['borne haute de poids', { ...valid, weightKg: 640 }],
    ])('accepte la %s (bornes inclusives)', (_label, props) => {
      expect(isOk(BodyMeasurements.create(props))).toBe(true)
    })
  })

  describe('basalMetabolicRate — Mifflin-St Jeor', () => {
    it('applique la constante +5 pour un homme', () => {
      const m = BodyMeasurements.reconstitute({
        heightCm: 180,
        weightKg: 80,
        ageYears: 30,
        biologicalSex: BiologicalSex.MALE,
      })

      // 10·80 + 6.25·180 − 5·30 + 5 = 800 + 1125 − 150 + 5
      expect(m.basalMetabolicRate()).toBeCloseTo(1780, 10)
    })

    it('applique la constante −161 pour une femme', () => {
      const m = BodyMeasurements.reconstitute({
        heightCm: 165,
        weightKg: 60,
        ageYears: 25,
        biologicalSex: BiologicalSex.FEMALE,
      })

      // 10·60 + 6.25·165 − 5·25 − 161 = 600 + 1031.25 − 125 − 161
      expect(m.basalMetabolicRate()).toBeCloseTo(1345.25, 10)
    })

    it('sépare les deux sexes de exactement 166 kcal à mesures égales', () => {
      const male = BodyMeasurements.reconstitute({ ...valid, biologicalSex: BiologicalSex.MALE })
      const female = BodyMeasurements.reconstitute({
        ...valid,
        biologicalSex: BiologicalSex.FEMALE,
      })

      expect(male.basalMetabolicRate() - female.basalMetabolicRate()).toBeCloseTo(166, 10)
    })

    it('décroît avec l’âge, à raison de 5 kcal par année', () => {
      const young = BodyMeasurements.reconstitute({ ...valid, ageYears: 30 })
      const older = BodyMeasurements.reconstitute({ ...valid, ageYears: 40 })

      expect(young.basalMetabolicRate() - older.basalMetabolicRate()).toBeCloseTo(50, 10)
    })

    it('reste positif aux bornes basses', () => {
      const m = BodyMeasurements.reconstitute({
        heightCm: 50,
        weightKg: 20,
        ageYears: 120,
        biologicalSex: BiologicalSex.FEMALE,
      })

      // 200 + 312.5 − 600 − 161 est négatif : le cas limite existe et doit être
      // connu plutôt que masqué par un `Math.max`.
      expect(m.basalMetabolicRate()).toBeCloseTo(-248.5, 10)
    })
  })

  describe('immutabilité', () => {
    it('withWeight ne touche pas à l’instance d’origine', () => {
      const original = BodyMeasurements.reconstitute(valid)
      const updated = original.withWeight(90)

      expect(isOk(updated)).toBe(true)
      if (isOk(updated)) {
        expect(updated.value).not.toBe(original)
        expect(updated.value.weightKg).toBe(90)
        expect(updated.value.heightCm).toBe(180)
      }
      expect(original.weightKg).toBe(75)
    })

    it('withWeight refuse une valeur hors bornes', () => {
      const original = BodyMeasurements.reconstitute(valid)

      expect(isErr(original.withWeight(0))).toBe(true)
      expect(original.weightKg).toBe(75)
    })

    it('withHeight et withAge suivent la même règle', () => {
      const original = BodyMeasurements.reconstitute(valid)
      const taller = original.withHeight(185)
      const older = original.withAge(31)

      expect(isOk(taller)).toBe(true)
      expect(isOk(older)).toBe(true)
      if (isOk(taller)) expect(taller.value.heightCm).toBe(185)
      if (isOk(older)) expect(older.value.ageYears).toBe(31)
      expect(original.heightCm).toBe(180)
      expect(original.ageYears).toBe(30)
      expect(isErr(original.withHeight(0))).toBe(true)
      expect(isErr(original.withAge(200))).toBe(true)
    })
  })

  it('compare par valeur', () => {
    const a = BodyMeasurements.reconstitute(valid)
    const b = BodyMeasurements.reconstitute(valid)
    const c = BodyMeasurements.reconstitute({ ...valid, weightKg: 76 })

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it('sérialise en objet nu', () => {
    expect(BodyMeasurements.reconstitute(valid).toJSON()).toEqual(valid)
  })
})
