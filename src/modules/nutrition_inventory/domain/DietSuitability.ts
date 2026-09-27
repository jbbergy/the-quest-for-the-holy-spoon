import { FoodTag } from './FoodItem'

/**
 * Régimes auxquels un aliment peut ne pas convenir.
 *
 * Les valeurs sont celles des restrictions du profil : la couche application
 * passe les unes pour les autres sans traduction. Le type est redéclaré ici
 * plutôt qu'importé, parce qu'un module n'importe pas le domaine d'un autre.
 */
export const Diet = {
  GLUTEN_FREE: 'GLUTEN_FREE',
  LACTOSE_FREE: 'LACTOSE_FREE',
  VEGETARIAN: 'VEGETARIAN',
  VEGAN: 'VEGAN',
  PESCATARIAN: 'PESCATARIAN',
  PORK_FREE: 'PORK_FREE',
  BEEF_FREE: 'BEEF_FREE',
  SHELLFISH_FREE: 'SHELLFISH_FREE',
  ALCOHOL_FREE: 'ALCOHOL_FREE',
} as const
export type Diet = (typeof Diet)[keyof typeof Diet]

interface DietRule {
  /** Un seul de ces marqueurs suffit à écarter l'aliment… */
  readonly excludedBy: readonly FoodTag[]
  /** … sauf si la fiche porte l'un de ceux-ci, qui l'admettent expressément. */
  readonly admittedBy: readonly FoodTag[]
}

/** Tout ce qui vient d'un animal tué : viande, porc, bœuf, poisson, fruits de mer. */
const ANIMAL_FLESH = [
  FoodTag.CONTAINS_MEAT,
  FoodTag.CONTAINS_PORK,
  FoodTag.CONTAINS_BEEF,
  FoodTag.CONTAINS_FISH,
  FoodTag.CONTAINS_SHELLFISH,
] as const

/**
 * Un aliment végétarien ou végan ne contient ni porc, ni bœuf, ni fruits de
 * mer : son étiquette suffit à l'admettre.
 */
const MEATLESS = [FoodTag.VEGETARIAN, FoodTag.VEGAN] as const

const RULES: Readonly<Record<Diet, DietRule>> = {
  GLUTEN_FREE: { excludedBy: [FoodTag.CONTAINS_GLUTEN], admittedBy: [FoodTag.GLUTEN_FREE] },
  LACTOSE_FREE: { excludedBy: [FoodTag.CONTAINS_MILK], admittedBy: [FoodTag.LACTOSE_FREE] },
  VEGETARIAN: { excludedBy: ANIMAL_FLESH, admittedBy: MEATLESS },
  VEGAN: {
    excludedBy: [...ANIMAL_FLESH, FoodTag.CONTAINS_MILK, FoodTag.CONTAINS_EGG],
    admittedBy: [FoodTag.VEGAN],
  },
  PESCATARIAN: {
    excludedBy: [FoodTag.CONTAINS_MEAT, FoodTag.CONTAINS_PORK, FoodTag.CONTAINS_BEEF],
    admittedBy: MEATLESS,
  },
  PORK_FREE: { excludedBy: [FoodTag.CONTAINS_PORK], admittedBy: MEATLESS },
  BEEF_FREE: { excludedBy: [FoodTag.CONTAINS_BEEF], admittedBy: MEATLESS },
  SHELLFISH_FREE: { excludedBy: [FoodTag.CONTAINS_SHELLFISH], admittedBy: MEATLESS },
  // Rien n'admet expressément : « végan » ne dit rien de l'alcool.
  ALCOHOL_FREE: { excludedBy: [FoodTag.CONTAINS_ALCOHOL], admittedBy: [] },
}

/**
 * Ce qu'un aliment doit porter pour être jugé : ses marqueurs, rien d'autre.
 * Une fiche du catalogue comme la ligne d'un repas en ont.
 */
interface Tagged {
  readonly tags: readonly FoodTag[]
}

export const DietSuitability = {
  /**
   * Régimes, parmi `diets`, auxquels l'aliment ne convient pas. Vide : il
   * convient à tous.
   *
   * Les marqueurs ne servent qu'à **exclure** : un aliment sans marqueur
   * convient à tout le monde. C'est une limite assumée — Ciqual n'indique ni
   * gluten ni lait, et les marqueurs sont déduits de ses catégories et des
   * noms. Mieux vaut laisser passer un aliment douteux, que la personne
   * reconnaîtra, que d'en masquer un qui lui convient sans qu'elle le sache.
   */
  conflicts(food: Tagged, diets: readonly Diet[]): Diet[] {
    return diets.filter((diet) => {
      const rule = RULES[diet]
      if (rule.admittedBy.some((tag) => food.tags.includes(tag))) return false
      return rule.excludedBy.some((tag) => food.tags.includes(tag))
    })
  },

  suits(food: Tagged, diets: readonly Diet[]): boolean {
    return DietSuitability.conflicts(food, diets).length === 0
  },
} as const
