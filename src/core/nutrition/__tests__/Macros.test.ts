import { describe, expect, it } from 'vitest'

import { Macros } from '@/core/nutrition/Macros'
import { isErr, isOk } from '@/core/result'

const macros = (proteinG: number, carbsG: number, fatG: number): Macros =>
  Macros.reconstitute({ proteinG, carbsG, fatG })

describe('Macros', () => {
  describe('create', () => {
    it('accepte un triplet positif ou nul', () => {
      const result = Macros.create({ proteinG: 10, carbsG: 20, fatG: 0 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.proteinG).toBe(10)
        expect(result.value.carbsG).toBe(20)
        expect(result.value.fatG).toBe(0)
      }
    })

    it.each([
      ['protéines négatives', { proteinG: -1, carbsG: 0, fatG: 0 }],
      ['glucides négatifs', { proteinG: 0, carbsG: -1, fatG: 0 }],
      ['lipides négatifs', { proteinG: 0, carbsG: 0, fatG: -1 }],
      ['valeur NaN', { proteinG: Number.NaN, carbsG: 0, fatG: 0 }],
      ['valeur infinie', { proteinG: 0, carbsG: Number.POSITIVE_INFINITY, fatG: 0 }],
    ])('refuse %s', (_label, props) => {
      const result = Macros.create(props)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MACROS')
    })
  })

  describe('calories', () => {
    it('applique les coefficients d’Atwater 4/4/9', () => {
      expect(macros(10, 20, 5).calories()).toBe(10 * 4 + 20 * 4 + 5 * 9)
    })

    it('vaut zéro pour des macros nulles', () => {
      expect(Macros.zero().calories()).toBe(0)
    })
  })

  describe('scale', () => {
    it('met à l’échelle les trois macros', () => {
      const result = macros(10, 20, 5).scale(2.5)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.equals(macros(25, 50, 12.5))).toBe(true)
    })

    it('ne mute pas l’instance d’origine', () => {
      const original = macros(10, 20, 5)
      original.scale(3)

      expect(original.equals(macros(10, 20, 5))).toBe(true)
    })

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse le facteur %p', (factor) => {
      const result = macros(1, 1, 1).scale(factor)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_MACROS')
    })

    it('accepte un facteur nul', () => {
      const result = macros(10, 20, 5).scale(0)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.isZero()).toBe(true)
    })
  })

  describe('plus', () => {
    it('additionne macro à macro', () => {
      expect(macros(1, 2, 3).plus(macros(10, 20, 30)).equals(macros(11, 22, 33))).toBe(true)
    })

    it('retourne une nouvelle instance sans muter les opérandes', () => {
      const a = macros(1, 2, 3)
      const b = macros(10, 20, 30)
      const sum = a.plus(b)

      expect(sum).not.toBe(a)
      expect(a.equals(macros(1, 2, 3))).toBe(true)
      expect(b.equals(macros(10, 20, 30))).toBe(true)
    })
  })

  describe('minus', () => {
    it('soustrait macro à macro', () => {
      expect(macros(10, 20, 30).minus(macros(1, 2, 3)).equals(macros(9, 18, 27))).toBe(true)
    })

    it('borne le résultat à zéro plutôt que de produire un reste négatif', () => {
      expect(macros(1, 2, 3).minus(macros(10, 20, 30)).isZero()).toBe(true)
    })
  })

  it('sérialise en objet nu', () => {
    expect(macros(1, 2, 3).toJSON()).toEqual({ proteinG: 1, carbsG: 2, fatG: 3 })
  })

  it('compare par valeur', () => {
    expect(macros(1, 2, 3).equals(macros(1, 2, 3))).toBe(true)
    expect(macros(1, 2, 3).equals(macros(1, 2, 4))).toBe(false)
  })
})
