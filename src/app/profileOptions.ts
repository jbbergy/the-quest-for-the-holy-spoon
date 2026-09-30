import { detailed, labelled } from '@/i18n'
import { Diet } from '@/modules/nutrition_inventory/application'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryRestriction } from '@/modules/player_profile/domain/DietaryPreferences'

/**
 * Choix du profil, partagés par la création du profil et les réglages.
 *
 * Ils étaient recopiés dans chaque écran, et les réglages avaient perdu
 * l'explication des niveaux d'activité : « Modérée » seul ne dit pas combien
 * de séances par semaine.
 */
export const SEX_OPTIONS = [
  labelled(BiologicalSex.FEMALE, 'labels.sex.female'),
  labelled(BiologicalSex.MALE, 'labels.sex.male'),
] as const

export const ACTIVITY_OPTIONS = [
  detailed(ActivityLevel.SEDENTARY, 'labels.activity.sedentary'),
  detailed(ActivityLevel.LIGHT, 'labels.activity.light'),
  detailed(ActivityLevel.MODERATE, 'labels.activity.moderate'),
  detailed(ActivityLevel.ACTIVE, 'labels.activity.active'),
  detailed(ActivityLevel.VERY_ACTIVE, 'labels.activity.veryActive'),
] as const

/** Ce que l'on mange : un seul choix a du sens, mais aucun n'est obligatoire. */
export const DIET_OPTIONS = [
  detailed(DietaryRestriction.VEGETARIAN, 'labels.diet.vegetarian'),
  detailed(DietaryRestriction.PESCATARIAN, 'labels.diet.pescatarian'),
  detailed(DietaryRestriction.VEGAN, 'labels.diet.vegan'),
] as const

/**
 * Ce que l'on ne mange pas, par type d'aliment plutôt que par religion : la
 * case promet exactement ce que l'application sait repérer — elle ne vérifie
 * aucune certification halal ou casher —, sert aussi à qui évite un aliment
 * sans raison religieuse, et laisse chacun combiner ce qu'il pratique.
 */
export const AVOID_OPTIONS = [
  detailed(DietaryRestriction.GLUTEN_FREE, 'labels.diet.glutenFree'),
  detailed(DietaryRestriction.LACTOSE_FREE, 'labels.diet.lactoseFree'),
  detailed(DietaryRestriction.PORK_FREE, 'labels.diet.porkFree'),
  detailed(DietaryRestriction.BEEF_FREE, 'labels.diet.beefFree'),
  detailed(DietaryRestriction.SHELLFISH_FREE, 'labels.diet.shellfishFree'),
  detailed(DietaryRestriction.ALCOHOL_FREE, 'labels.diet.alcoholFree'),
] as const

export const RESTRICTION_OPTIONS = [...DIET_OPTIONS, ...AVOID_OPTIONS] as const

/** Nom d'un régime, pour dire pourquoi un aliment est masqué. */
export function dietLabel(diet: Diet): string {
  return RESTRICTION_OPTIONS.find((option) => option.value === diet)?.label ?? diet
}

/** Régimes du profil, dans le vocabulaire de la recherche d'aliments (les valeurs sont les mêmes). */
export function dietsOf(restrictions: readonly DietaryRestriction[]): Diet[] {
  const known = Object.values(Diet) as readonly string[]
  return restrictions.filter((restriction): restriction is Diet => known.includes(restriction))
}
