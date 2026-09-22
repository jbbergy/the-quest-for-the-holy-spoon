import { describe, expect, it } from 'vitest'

import { Quantity } from '@/core/nutrition/Quantity'
import { isErr, isOk } from '@/core/result'

const expectErrorCode = (result: ReturnType<typeof Quantity.create>, code: string): void => {
  expect(isErr(result)).toBe(true)
  if (isErr(result)) expect(result.error.code).toBe(code)
}

describe('Quantity', () => {
  it('accepte une portion strictement positive', () => {
    const result = Quantity.create(125)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value.grams).toBe(125)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100_001])(
    'refuse la portion invalide %p',
    (grams) => {
      expectErrorCode(Quantity.create(grams), 'INVALID_PORTION')
    },
  )

  it('refuse zéro : une ligne de repas vide est une suppression, pas une portion', () => {
    expectErrorCode(Quantity.create(0), 'INVALID_PORTION')
  })

  it('expose le facteur d’échelle vers la base « pour 100 g »', () => {
    const result = Quantity.create(250)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value.ratioTo100g).toBe(2.5)
  })

  it('compare par valeur', () => {
    const a = Quantity.reconstitute(100)
    const b = Quantity.reconstitute(100)
    const c = Quantity.reconstitute(101)

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it('se réhydrate sans revalider', () => {
    expect(Quantity.reconstitute(42).grams).toBe(42)
  })

  it('s’affiche avec son unité', () => {
    expect(Quantity.reconstitute(80).toString()).toBe('80 g')
  })
})
