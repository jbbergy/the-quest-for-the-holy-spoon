import { describe, expect, it } from 'vitest'

import {
  formatAmount,
  formatPortion,
  formatWeight,
  measureOptionLabel,
  per100Label,
  pluralize,
} from '@/app/portionFormat'
import { GRAM, millilitre } from '@/modules/nutrition_inventory/domain/Measure'

const slice = { label: 'tranche', grams: 25, countable: true, approximate: false }
const glass = { label: 'verre', grams: 206, countable: true, approximate: true }

describe('formatAmount', () => {
  it.each([
    [0.5, '½'],
    [1.5, '1½'],
    [2.25, '2¼'],
    [3, '3'],
    [1.3, '1,3'],
  ])('%p → %p', (amount, text) => {
    expect(formatAmount(amount)).toBe(text)
  })
})

describe('pluralize', () => {
  it.each([
    ['tranche', 'tranches'],
    ['morceau', 'morceaux'],
    ['noix', 'noix'],
    ['c. à soupe', 'c. à soupe'],
    ['part de gâteau', 'parts de gâteau'],
    ['pomme de terre', 'pommes de terre'],
    ['petit-suisse', 'petits-suisses'],
    ['petite bouteille', 'petites bouteilles'],
  ])('%p → %p', (label, plural) => {
    expect(pluralize(label)).toBe(plural)
  })
})

describe('formatPortion', () => {
  it('accorde à partir de 2, comme le veut le français', () => {
    expect(formatPortion(1.5, slice)).toBe('1½ tranche')
    expect(formatPortion(2, slice)).toBe('2 tranches')
  })

  it('arrondit grammes et millilitres à l’unité', () => {
    expect(formatPortion(152.4, GRAM)).toBe('152 g')
    expect(formatPortion(330, millilitre(1))).toBe('330 ml')
  })
})

describe('formatWeight et measureOptionLabel', () => {
  it('parle dans l’unité de la fiche et signale une moyenne', () => {
    expect(formatWeight(50, slice)).toBe('50 g')
    expect(formatWeight(206, glass, millilitre(1.03))).toBe('environ 200 ml')
    expect(measureOptionLabel(glass, millilitre(1.03))).toBe('verre (environ 200 ml)')
    expect(measureOptionLabel(GRAM)).toBe('g')
  })

  it('n’annonce « 100 ml » que pour une fiche réellement exprimée pour 100 ml', () => {
    expect(per100Label({ unit: 'ml', density: 1 })).toBe('100 ml')
    expect(per100Label({ unit: 'ml', density: 1.03 })).toBe('100 g')
    expect(per100Label({ unit: 'g', density: 1 })).toBe('100 g')
  })
})
