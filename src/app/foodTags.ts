import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'

/** Libellés des marqueurs diététiques, dans l'ordre où les écrans les proposent. */
export const TAG_OPTIONS = [
  { value: FoodTag.VEGETARIAN, label: 'Végétarien' },
  { value: FoodTag.VEGAN, label: 'Végan' },
  { value: FoodTag.GLUTEN_FREE, label: 'Sans gluten' },
  { value: FoodTag.LACTOSE_FREE, label: 'Sans lactose' },
  { value: FoodTag.CONTAINS_MEAT, label: 'Contient de la viande' },
  { value: FoodTag.CONTAINS_FISH, label: 'Contient du poisson' },
  { value: FoodTag.CONTAINS_NUTS, label: 'Contient des fruits à coque' },
] as const

export function tagLabel(tag: FoodTag): string {
  return TAG_OPTIONS.find((option) => option.value === tag)?.label ?? tag
}
