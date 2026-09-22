import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '@/core/result'
import { XpAmount } from '@/modules/gamification/domain/XpAmount'

describe('XpAmount', () => {
  it('accepte un entier positif ou nul', () => {
    expect(isOk(XpAmount.create(0))).toBe(true)
    expect(isOk(XpAmount.create(250))).toBe(true)
  })

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 100_001])(
    'refuse la valeur %p',
    (value) => {
      const result = XpAmount.create(value)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_XP_AMOUNT')
    },
  )

  it('refuse les décimales : les seuils de niveau dériveraient à l’addition', () => {
    expect(isErr(XpAmount.create(10.000001))).toBe(true)
  })

  it('additionne dans une nouvelle instance', () => {
    const a = XpAmount.reconstitute(10)
    const b = XpAmount.reconstitute(5)

    const sum = a.plus(b)

    expect(sum.value).toBe(15)
    expect(sum).not.toBe(a)
    expect(a.value).toBe(10)
    expect(b.value).toBe(5)
  })

  it('expose un zéro et le reconnaît', () => {
    expect(XpAmount.zero().value).toBe(0)
    expect(XpAmount.zero().isZero).toBe(true)
    expect(XpAmount.reconstitute(1).isZero).toBe(false)
  })

  it('compare par valeur', () => {
    expect(XpAmount.reconstitute(10).equals(XpAmount.reconstitute(10))).toBe(true)
    expect(XpAmount.reconstitute(10).equals(XpAmount.reconstitute(11))).toBe(false)
  })
})
