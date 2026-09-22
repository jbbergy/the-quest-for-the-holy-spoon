import { InvalidFoodItemError } from '@/core/errors'
import { type FoodItemId, newId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

/** Provenance d'une fiche : détermine sa fiabilité et son comportement hors-ligne. */
export const FoodSource = {
  CIQUAL: 'CIQUAL',
  OPEN_FOOD_FACTS: 'OPEN_FOOD_FACTS',
  USER: 'USER',
} as const
export type FoodSource = (typeof FoodSource)[keyof typeof FoodSource]

/** Marqueurs diététiques portés par la fiche, confrontés aux `DietaryPreferences`. */
export const FoodTag = {
  GLUTEN_FREE: 'GLUTEN_FREE',
  LACTOSE_FREE: 'LACTOSE_FREE',
  VEGETARIAN: 'VEGETARIAN',
  VEGAN: 'VEGAN',
  CONTAINS_FISH: 'CONTAINS_FISH',
  CONTAINS_MEAT: 'CONTAINS_MEAT',
  CONTAINS_NUTS: 'CONTAINS_NUTS',
} as const
export type FoodTag = (typeof FoodTag)[keyof typeof FoodTag]

export interface FoodItemProps {
  readonly id: FoodItemId
  readonly name: string
  readonly macrosPer100g: Macros
  /**
   * Fibres, sucres, AG saturés et sel pour 100 g.
   *
   * Facultatif, et délibérément : une fiche Open Food Facts renseignée à moitié
   * ou un aliment saisi à la va-vite n'ont pas à être refusés. L'absence vaut
   * alors zéro — la même convention que le convertisseur Ciqual applique aux
   * macronutriments manquants.
   */
  readonly detailPer100g?: NutrientDetail
  readonly source: FoodSource
  readonly barcode?: string
  readonly tags?: readonly FoodTag[]
}

const MAX_NAME_LENGTH = 200

/**
 * EAN-8 à GTIN-14 : les formats que portent les produits alimentaires.
 *
 * Exporté parce que deux décisions en dépendent et doivent rester cohérentes :
 * accepter un code-barres sur une fiche, et reconnaître qu'une saisie de
 * recherche en est un. Les dissocier ferait accepter au catalogue des codes que
 * la recherche refuserait de chercher.
 */
const BARCODE_PATTERN = /^\d{8,14}$/

/** Une saisie utilisateur est-elle un code-barres plutôt qu'un nom d'aliment ? */
export function isBarcode(text: string): boolean {
  return BARCODE_PATTERN.test(text.trim())
}

/**
 * Une fiche du catalogue d'aliments (Ciqual, Open Food Facts, ou saisie utilisateur).
 *
 * Immuable. Point capital : une `MealEntry` ne référence jamais cette entité, elle
 * en fige un instantané. Une fiche peut donc être corrigée sans réécrire l'histoire
 * nutritionnelle du joueur.
 */
export class FoodItem {
  private constructor(
    readonly id: FoodItemId,
    readonly name: string,
    readonly macrosPer100g: Macros,
    readonly detailPer100g: NutrientDetail,
    readonly source: FoodSource,
    readonly barcode: string | undefined,
    readonly tags: readonly FoodTag[],
  ) {}

  static create(
    props: Omit<FoodItemProps, 'id'> & { id?: FoodItemId },
  ): Result<FoodItem, InvalidFoodItemError> {
    const name = props.name.trim()
    if (name.length === 0) {
      return err(new InvalidFoodItemError('Le nom de l’aliment est obligatoire.'))
    }
    if (name.length > MAX_NAME_LENGTH) {
      return err(
        new InvalidFoodItemError(`Le nom de l’aliment dépasse ${MAX_NAME_LENGTH} caractères.`),
      )
    }

    const barcode = props.barcode?.trim()
    if (barcode !== undefined && !BARCODE_PATTERN.test(barcode)) {
      return err(new InvalidFoodItemError(`Code-barres invalide : ${props.barcode}.`))
    }

    return ok(
      new FoodItem(
        props.id ?? newId<'FoodItemId'>(),
        name,
        props.macrosPer100g,
        props.detailPer100g ?? NutrientDetail.zero(),
        props.source,
        barcode,
        dedupeTags(props.tags ?? []),
      ),
    )
  }

  static reconstitute(props: FoodItemProps): FoodItem {
    return new FoodItem(
      props.id,
      props.name,
      props.macrosPer100g,
      props.detailPer100g ?? NutrientDetail.zero(),
      props.source,
      props.barcode,
      props.tags ?? [],
    )
  }

  /** Macros de la fiche ramenées à une portion donnée, exprimée en grammes. */
  macrosForGrams(grams: number): Result<Macros, InvalidFoodItemError> {
    const scaled = this.macrosPer100g.scale(grams / 100)
    return scaled.ok ? scaled : err(new InvalidFoodItemError(scaled.error.message))
  }

  /** Nutriments complémentaires ramenés à une portion, en grammes. */
  detailForGrams(grams: number): Result<NutrientDetail, InvalidFoodItemError> {
    const scaled = this.detailPer100g.scale(grams / 100)
    return scaled.ok ? scaled : err(new InvalidFoodItemError(scaled.error.message))
  }

  hasTag(tag: FoodTag): boolean {
    return this.tags.includes(tag)
  }

  /** Correction d'une fiche : retourne une nouvelle instance. */
  withMacros(macrosPer100g: Macros): FoodItem {
    return new FoodItem(
      this.id,
      this.name,
      macrosPer100g,
      this.detailPer100g,
      this.source,
      this.barcode,
      this.tags,
    )
  }

  rename(name: string): Result<FoodItem, InvalidFoodItemError> {
    return FoodItem.create({
      id: this.id,
      name,
      macrosPer100g: this.macrosPer100g,
      detailPer100g: this.detailPer100g,
      source: this.source,
      ...(this.barcode === undefined ? {} : { barcode: this.barcode }),
      tags: this.tags,
    })
  }

  equals(other: FoodItem): boolean {
    return this.id === other.id
  }
}

function dedupeTags(tags: readonly FoodTag[]): readonly FoodTag[] {
  return Object.freeze([...new Set(tags)])
}
