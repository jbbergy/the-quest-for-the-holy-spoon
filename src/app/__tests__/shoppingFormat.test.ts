import { describe, expect, it } from 'vitest'

import { formatShoppingQuantity } from '@/app/shopping/shoppingFormat'
import { idFrom } from '@/core/identity'
import type { ShoppingItemView, ShoppingUnit } from '@/modules/shopping/application'

const GRAM: ShoppingUnit = { label: 'g', grams: 1, countable: false, approximate: false }
const ML: ShoppingUnit = { label: 'ml', grams: 1.03, countable: false, approximate: false }
const EGG: ShoppingUnit = { label: 'œuf', grams: 60, countable: true, approximate: true }

const item = (amount: number, unit: ShoppingUnit, foodItemId: string | null = 'f'): ShoppingItemView => ({
  id: idFrom('i'),
  name: 'x',
  foodItemId: foodItemId === null ? null : idFrom(foodItemId),
  amount,
  grams: amount * unit.grams,
  unit,
  quantityText: null,
  checked: false,
  neededBy: [],
})

describe('formatShoppingQuantity', () => {
  it.each([
    [item(3, EGG), '3 œufs'],
    [item(2.2, EGG), '2½ œufs'],
    [item(0.4, EGG), '½ œuf'],
    [item(742, GRAM), '745 g'],
    [item(1230, GRAM), '1,3 kg'],
    [item(333, ML), '340 ml'],
    [item(1500, ML), '1,5 L'],
  ])('arrondit au-dessus : %#', (value, expected) => {
    expect(formatShoppingQuantity(value)).toBe(expected)
  })

  it('reprend telle quelle la quantité écrite d’un article sans aliment', () => {
    expect(formatShoppingQuantity({ ...item(0, GRAM, null), quantityText: '2 paquets' })).toBe('2 paquets')
  })

  it('ne dit rien pour un article écrit à la main, ou déjà acheté et plus demandé', () => {
    expect(formatShoppingQuantity(item(0, GRAM, null))).toBe('')
    expect(formatShoppingQuantity(item(0, GRAM))).toBe('')
  })
})
