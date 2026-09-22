import { describe, expect, it } from 'vitest'

import { NutrientDetail, type NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { isErr, isOk } from '@/core/result'

const detail = (props: Partial<NutrientDetailProps> = {}): NutrientDetail =>
  NutrientDetail.reconstitute({
    fiberG: 0,
    sugarsG: 0,
    saturatedFatG: 0,
    saltG: 0,
    ...props,
  })

describe('NutrientDetail', () => {
  describe('create', () => {
    it('accepte des valeurs positives ou nulles', () => {
      const result = NutrientDetail.create({
        fiberG: 3.2,
        sugarsG: 12,
        saturatedFatG: 0,
        saltG: 0.8,
      })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.fiberG).toBe(3.2)
        expect(result.value.sugarsG).toBe(12)
        expect(result.value.saturatedFatG).toBe(0)
        expect(result.value.saltG).toBe(0.8)
      }
    })

    it.each([
      ['fibres négatives', { fiberG: -1 }],
      ['sucres négatifs', { sugarsG: -1 }],
      ['AG saturés négatifs', { saturatedFatG: -1 }],
      ['sel négatif', { saltG: -0.1 }],
      ['valeur NaN', { fiberG: Number.NaN }],
      ['valeur infinie', { saltG: Number.POSITIVE_INFINITY }],
    ])('refuse %s', (_label, override) => {
      const result = NutrientDetail.create({
        fiberG: 0,
        sugarsG: 0,
        saturatedFatG: 0,
        saltG: 0,
        ...override,
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_NUTRIENTS')
    })

    it('n’impose aucune relation d’inclusion entre nutriments', () => {
      /*
       * Verrou d'intention. Des sucres supérieurs aux glucides sont
       * arithmétiquement absurdes, mais l'ANSES en publie : 46 fiches du
       * catalogue le font, d'au plus 0,6 g, par effet d'arrondi et de méthodes
       * analytiques distinctes. Une règle d'inclusion rejetterait ces fiches
       * légitimes — ce VO ne connaît d'ailleurs pas les glucides, qui vivent
       * dans `Macros`.
       */
      const result = NutrientDetail.create({
        fiberG: 0,
        sugarsG: 999,
        saturatedFatG: 999,
        saltG: 0,
      })

      expect(isOk(result)).toBe(true)
    })
  })

  describe('scale', () => {
    it('ramène une base 100 g à la portion réelle', () => {
      const scaled = detail({ fiberG: 2, sugarsG: 10, saturatedFatG: 4, saltG: 1 }).scale(1.5)

      expect(isOk(scaled)).toBe(true)
      if (isOk(scaled)) {
        expect(scaled.value.fiberG).toBe(3)
        expect(scaled.value.sugarsG).toBe(15)
        expect(scaled.value.saturatedFatG).toBe(6)
        expect(scaled.value.saltG).toBe(1.5)
      }
    })

    it.each([
      ['un facteur négatif', -1],
      ['un facteur NaN', Number.NaN],
      ['un facteur infini', Number.POSITIVE_INFINITY],
    ])('refuse %s', (_label, factor) => {
      const result = detail({ fiberG: 2 }).scale(factor)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_NUTRIENTS')
    })

    it('ne modifie pas l’instance d’origine', () => {
      const original = detail({ fiberG: 2 })

      const scaled = original.scale(3)

      expect(original.fiberG).toBe(2)
      if (isOk(scaled)) expect(scaled.value).not.toBe(original)
    })
  })

  describe('plus et minus', () => {
    it('additionne champ à champ', () => {
      const sum = detail({ fiberG: 2, saltG: 1 }).plus(detail({ fiberG: 3, sugarsG: 5 }))

      expect(sum.toJSON()).toEqual({
        fiberG: 5,
        sugarsG: 5,
        saturatedFatG: 0,
        saltG: 1,
      })
    })

    it('borne la soustraction à zéro, comme Macros', () => {
      // Un « reste » négatif n'a pas de sens : le dépassement se lit ailleurs.
      const remaining = detail({ fiberG: 10 }).minus(detail({ fiberG: 25, saltG: 3 }))

      expect(remaining.fiberG).toBe(0)
      expect(remaining.saltG).toBe(0)
    })

    it('retourne de nouvelles instances', () => {
      const original = detail({ fiberG: 2 })

      expect(original.plus(NutrientDetail.zero())).not.toBe(original)
      expect(original.minus(NutrientDetail.zero())).not.toBe(original)
      expect(original.fiberG).toBe(2)
    })
  })

  describe('zero, isZero et equals', () => {
    it('reconnaît l’absence complète de valeurs', () => {
      expect(NutrientDetail.zero().isZero()).toBe(true)
      expect(detail({ saltG: 0.1 }).isZero()).toBe(false)
    })

    it('compare par valeur, pas par référence', () => {
      expect(detail({ fiberG: 3 }).equals(detail({ fiberG: 3 }))).toBe(true)
      expect(detail({ fiberG: 3 }).equals(detail({ fiberG: 3.1 }))).toBe(false)
      expect(detail({ saltG: 1 }).equals(detail({ saltG: 2 }))).toBe(false)
    })
  })

  it('se sérialise en objet nu, prêt pour un read model', () => {
    expect(detail({ fiberG: 1, sugarsG: 2, saturatedFatG: 3, saltG: 4 }).toJSON()).toEqual({
      fiberG: 1,
      sugarsG: 2,
      saturatedFatG: 3,
      saltG: 4,
    })
  })
})
