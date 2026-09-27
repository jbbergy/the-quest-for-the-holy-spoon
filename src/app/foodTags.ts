import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'

/**
 * Libellés des marqueurs diététiques, dans l'ordre où les écrans les proposent.
 *
 * Deux groupes, parce qu'ils ne se lisent pas pareil : ce que l'aliment
 * **contient** l'écarte d'un régime, ce à quoi il **convient** l'y admet.
 */
export const CONTAINS_OPTIONS = [
  { value: FoodTag.CONTAINS_MEAT, label: 'De la viande' },
  { value: FoodTag.CONTAINS_PORK, label: 'Du porc' },
  { value: FoodTag.CONTAINS_BEEF, label: 'Du bœuf ou du veau' },
  { value: FoodTag.CONTAINS_FISH, label: 'Du poisson' },
  { value: FoodTag.CONTAINS_SHELLFISH, label: 'Des fruits de mer (crevettes, moules…)' },
  { value: FoodTag.CONTAINS_MILK, label: 'Du lait' },
  { value: FoodTag.CONTAINS_EGG, label: 'Des œufs' },
  { value: FoodTag.CONTAINS_GLUTEN, label: 'Du gluten (blé, orge, seigle)' },
  { value: FoodTag.CONTAINS_NUTS, label: 'Des fruits à coque' },
  { value: FoodTag.CONTAINS_ALCOHOL, label: 'De l’alcool' },
] as const

export const SUITS_OPTIONS = [
  { value: FoodTag.VEGETARIAN, label: 'Végétarien' },
  { value: FoodTag.VEGAN, label: 'Végan' },
  { value: FoodTag.GLUTEN_FREE, label: 'Sans gluten' },
  { value: FoodTag.LACTOSE_FREE, label: 'Sans lactose' },
] as const

/** Libellé d'un marqueur seul, sur la fiche d'un aliment. */
const TAG_LABELS: Readonly<Record<FoodTag, string>> = {
  [FoodTag.CONTAINS_MEAT]: 'Contient de la viande',
  [FoodTag.CONTAINS_PORK]: 'Contient du porc',
  [FoodTag.CONTAINS_BEEF]: 'Contient du bœuf ou du veau',
  [FoodTag.CONTAINS_FISH]: 'Contient du poisson',
  [FoodTag.CONTAINS_SHELLFISH]: 'Contient des fruits de mer',
  [FoodTag.CONTAINS_MILK]: 'Contient du lait',
  [FoodTag.CONTAINS_EGG]: 'Contient des œufs',
  [FoodTag.CONTAINS_GLUTEN]: 'Contient du gluten',
  [FoodTag.CONTAINS_NUTS]: 'Contient des fruits à coque',
  [FoodTag.CONTAINS_ALCOHOL]: 'Contient de l’alcool',
  [FoodTag.VEGETARIAN]: 'Végétarien',
  [FoodTag.VEGAN]: 'Végan',
  [FoodTag.GLUTEN_FREE]: 'Sans gluten',
  [FoodTag.LACTOSE_FREE]: 'Sans lactose',
}

export function tagLabel(tag: FoodTag): string {
  return TAG_LABELS[tag] ?? tag
}
