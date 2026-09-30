import { labelled, t } from '@/i18n'
import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'

/**
 * Libellés des marqueurs diététiques, dans l'ordre où les écrans les proposent.
 *
 * Deux groupes, parce qu'ils ne se lisent pas pareil : ce que l'aliment
 * **contient** l'écarte d'un régime, ce à quoi il **convient** l'y admet.
 */
export const CONTAINS_OPTIONS = [
  labelled(FoodTag.CONTAINS_MEAT, 'labels.contains.meat'),
  labelled(FoodTag.CONTAINS_PORK, 'labels.contains.pork'),
  labelled(FoodTag.CONTAINS_BEEF, 'labels.contains.beef'),
  labelled(FoodTag.CONTAINS_FISH, 'labels.contains.fish'),
  labelled(FoodTag.CONTAINS_SHELLFISH, 'labels.contains.shellfish'),
  labelled(FoodTag.CONTAINS_MILK, 'labels.contains.milk'),
  labelled(FoodTag.CONTAINS_EGG, 'labels.contains.egg'),
  labelled(FoodTag.CONTAINS_GLUTEN, 'labels.contains.gluten'),
  labelled(FoodTag.CONTAINS_NUTS, 'labels.contains.nuts'),
  labelled(FoodTag.CONTAINS_ALCOHOL, 'labels.contains.alcohol'),
] as const

export const SUITS_OPTIONS = [
  labelled(FoodTag.VEGETARIAN, 'labels.suits.vegetarian'),
  labelled(FoodTag.VEGAN, 'labels.suits.vegan'),
  labelled(FoodTag.GLUTEN_FREE, 'labels.suits.glutenFree'),
  labelled(FoodTag.LACTOSE_FREE, 'labels.suits.lactoseFree'),
] as const

/** Libellé d'un marqueur seul, sur la fiche d'un aliment. */
const TAG_LABELS: Readonly<Record<FoodTag, string>> = {
  [FoodTag.CONTAINS_MEAT]: 'labels.tag.meat',
  [FoodTag.CONTAINS_PORK]: 'labels.tag.pork',
  [FoodTag.CONTAINS_BEEF]: 'labels.tag.beef',
  [FoodTag.CONTAINS_FISH]: 'labels.tag.fish',
  [FoodTag.CONTAINS_SHELLFISH]: 'labels.tag.shellfish',
  [FoodTag.CONTAINS_MILK]: 'labels.tag.milk',
  [FoodTag.CONTAINS_EGG]: 'labels.tag.egg',
  [FoodTag.CONTAINS_GLUTEN]: 'labels.tag.gluten',
  [FoodTag.CONTAINS_NUTS]: 'labels.tag.nuts',
  [FoodTag.CONTAINS_ALCOHOL]: 'labels.tag.alcohol',
  [FoodTag.VEGETARIAN]: 'labels.tag.vegetarian',
  [FoodTag.VEGAN]: 'labels.tag.vegan',
  [FoodTag.GLUTEN_FREE]: 'labels.tag.glutenFree',
  [FoodTag.LACTOSE_FREE]: 'labels.tag.lactoseFree',
}

export function tagLabel(tag: FoodTag): string {
  return t(TAG_LABELS[tag] ?? tag)
}
