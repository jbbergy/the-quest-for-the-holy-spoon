import { describe, expect, it } from 'vitest'

import { combine, err, flatMap, isErr, isOk, map, mapErr, ok, unwrapOr } from '@/core/result'

describe('Result', () => {
  it('construit un succès et un échec discriminables', () => {
    const success = ok(42)
    const failure = err('boom')

    expect(isOk(success)).toBe(true)
    expect(isErr(success)).toBe(false)
    expect(isOk(failure)).toBe(false)
    expect(isErr(failure)).toBe(true)
  })

  describe('map', () => {
    it('transforme la valeur d’un succès', () => {
      expect(map(ok(2), (n) => n * 3)).toEqual(ok(6))
    })

    it('laisse un échec intact sans appeler la fonction', () => {
      let called = false
      const result = map(err<string>('boom'), () => {
        called = true
        return 1
      })

      expect(result).toEqual(err('boom'))
      expect(called).toBe(false)
    })
  })

  describe('mapErr', () => {
    it('transforme l’erreur d’un échec', () => {
      expect(mapErr(err('boom'), (e) => e.toUpperCase())).toEqual(err('BOOM'))
    })

    it('laisse un succès intact', () => {
      expect(mapErr(ok(1), () => 'ignoré')).toEqual(ok(1))
    })
  })

  describe('flatMap', () => {
    it('enchaîne sans imbriquer les Result', () => {
      expect(flatMap(ok(4), (n) => ok(n + 1))).toEqual(ok(5))
    })

    it('propage l’échec de l’opération chaînée', () => {
      expect(flatMap(ok(4), () => err('aval'))).toEqual(err('aval'))
    })

    it('court-circuite sur un échec amont', () => {
      let called = false
      const result = flatMap(err<string>('amont'), () => {
        called = true
        return ok(1)
      })

      expect(result).toEqual(err('amont'))
      expect(called).toBe(false)
    })
  })

  describe('unwrapOr', () => {
    it('retourne la valeur d’un succès', () => {
      expect(unwrapOr(ok(7), 0)).toBe(7)
    })

    it('retourne le repli sur un échec', () => {
      expect(unwrapOr(err<string>('boom'), 0)).toBe(0)
    })
  })

  describe('combine', () => {
    it('agrège une liste de succès', () => {
      expect(combine([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]))
    })

    it('retourne le premier échec rencontré et s’arrête là', () => {
      const result = combine([ok(1), err('premier'), err('second')])

      expect(result).toEqual(err('premier'))
    })

    it('agrège une liste vide en succès vide', () => {
      expect(combine([])).toEqual(ok([]))
    })
  })
})
