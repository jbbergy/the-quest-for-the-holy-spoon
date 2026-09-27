import { formatPortion } from '@/app/portionFormat'
import type { ShoppingItemView } from '@/modules/shopping/application'

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Arrondi au-dessus : on n'achète pas un peu moins que ce qu'il faut. */
function roundUp(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step
}

/**
 * Quantité d'un article à acheter : « 6 œufs », « 750 g », « 1,2 kg »,
 * « 1,5 L ». Pour un article sans aliment, la quantité telle qu'on l'a écrite
 * (« 2 paquets »), ou rien.
 */
export function formatShoppingQuantity(item: ShoppingItemView): string {
  if (item.foodItemId === null) return item.quantityText ?? ''
  if (item.amount <= 0) return ''
  const { unit } = item

  if (unit.countable) return formatPortion(roundUp(item.amount, 0.5), unit)

  if (unit.label === 'ml') {
    const ml = roundUp(item.amount, 10)
    return ml >= 1000 ? `${decimal.format(roundUp(ml / 1000, 0.1))} L` : `${ml} ml`
  }

  const grams = roundUp(item.amount, 5)
  return grams >= 1000 ? `${decimal.format(roundUp(grams / 1000, 0.1))} kg` : `${grams} g`
}
