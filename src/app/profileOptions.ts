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
  { value: BiologicalSex.FEMALE, label: 'Femme' },
  { value: BiologicalSex.MALE, label: 'Homme' },
] as const

export const ACTIVITY_OPTIONS = [
  { value: ActivityLevel.SEDENTARY, label: 'Très peu actif', hint: 'Peu ou pas de sport' },
  { value: ActivityLevel.LIGHT, label: 'Un peu actif', hint: 'Sport 1 à 3 fois par semaine' },
  { value: ActivityLevel.MODERATE, label: 'Actif', hint: 'Sport 3 à 5 fois par semaine' },
  { value: ActivityLevel.ACTIVE, label: 'Très actif', hint: 'Sport 6 ou 7 fois par semaine' },
  {
    value: ActivityLevel.VERY_ACTIVE,
    label: 'Extrêmement actif',
    hint: 'Métier physique, ou sport 2 fois par jour',
  },
] as const

/** Ce que l'on mange : un seul choix a du sens, mais aucun n'est obligatoire. */
export const DIET_OPTIONS = [
  { value: DietaryRestriction.VEGETARIAN, label: 'Végétarien', hint: 'Ni viande, ni poisson, ni fruits de mer' },
  {
    value: DietaryRestriction.PESCATARIAN,
    label: 'Pescétarien',
    hint: 'Du poisson et des fruits de mer, mais pas de viande',
  },
  {
    value: DietaryRestriction.VEGAN,
    label: 'Végan',
    hint: 'Aucun produit animal : ni viande, ni poisson, ni lait, ni œufs',
  },
] as const

/**
 * Ce que l'on ne mange pas, par type d'aliment plutôt que par religion : la
 * case promet exactement ce que l'application sait repérer — elle ne vérifie
 * aucune certification halal ou casher —, sert aussi à qui évite un aliment
 * sans raison religieuse, et laisse chacun combiner ce qu'il pratique.
 */
export const AVOID_OPTIONS = [
  { value: DietaryRestriction.GLUTEN_FREE, label: 'Sans gluten', hint: 'Ni blé, ni orge, ni seigle' },
  { value: DietaryRestriction.LACTOSE_FREE, label: 'Sans lactose', hint: 'Pas de lait ni de produits laitiers' },
  {
    value: DietaryRestriction.PORK_FREE,
    label: 'Sans porc',
    hint: 'Ni porc, ni jambon, ni lardons, ni sanglier. Par exemple pour manger halal ou casher.',
  },
  {
    value: DietaryRestriction.BEEF_FREE,
    label: 'Sans bœuf',
    hint: 'Ni bœuf, ni veau. Par exemple pour beaucoup d’hindous.',
  },
  {
    value: DietaryRestriction.SHELLFISH_FREE,
    label: 'Sans fruits de mer',
    hint: 'Ni crevettes, ni moules, ni huîtres, ni calamars, ni escargots. Par exemple pour manger casher.',
  },
  {
    value: DietaryRestriction.ALCOHOL_FREE,
    label: 'Sans alcool',
    hint: 'Ni boissons alcoolisées, ni plats cuits au vin ou à la bière. Par exemple pour manger halal.',
  },
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
