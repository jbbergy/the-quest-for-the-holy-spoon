import { InvalidFoodItemError } from '@/core/errors'
import { type FoodItemId, newId, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import {
  BaseUnit,
  GRAM,
  isValidDensity,
  type Measure,
  millilitre,
  type Serving,
  servingMeasure,
  validateServings,
} from './Measure'

/** Provenance d'une fiche : détermine sa fiabilité et son comportement hors-ligne. */
export const FoodSource = {
  CIQUAL: 'CIQUAL',
  OPEN_FOOD_FACTS: 'OPEN_FOOD_FACTS',
  USER: 'USER',
} as const
export type FoodSource = (typeof FoodSource)[keyof typeof FoodSource]

/**
 * Marqueurs diététiques portés par la fiche, confrontés aux régimes
 * (`DietSuitability`).
 *
 * Deux familles : les `CONTAINS_*` **excluent** un aliment d'un régime, les
 * autres (`VEGAN`, `GLUTEN_FREE`…) l'y **admettent** malgré tout — un pain
 * sans gluten reste un pain.
 */
export const FoodTag = {
  GLUTEN_FREE: 'GLUTEN_FREE',
  LACTOSE_FREE: 'LACTOSE_FREE',
  VEGETARIAN: 'VEGETARIAN',
  VEGAN: 'VEGAN',
  CONTAINS_FISH: 'CONTAINS_FISH',
  CONTAINS_MEAT: 'CONTAINS_MEAT',
  CONTAINS_NUTS: 'CONTAINS_NUTS',
  CONTAINS_GLUTEN: 'CONTAINS_GLUTEN',
  CONTAINS_MILK: 'CONTAINS_MILK',
  CONTAINS_EGG: 'CONTAINS_EGG',
  CONTAINS_PORK: 'CONTAINS_PORK',
  CONTAINS_BEEF: 'CONTAINS_BEEF',
  /** Crustacés et mollusques : crevettes, moules, huîtres, calmars, escargots. */
  CONTAINS_SHELLFISH: 'CONTAINS_SHELLFISH',
  CONTAINS_ALCOHOL: 'CONTAINS_ALCOHOL',
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
  /**
   * Profil qui a créé l'aliment, pour une fiche `USER` ; `null` pour Ciqual et
   * Open Food Facts, qui n'ont pas d'auteur. Au sein d'un foyer, chacun voit
   * les aliments des autres, mais seul l'auteur les modifie.
   */
  readonly ownerId?: PlayerId | null
  /**
   * Unité de mesure de la fiche : `ml` pour un liquide. Facultative, le gramme
   * par défaut — c'était la seule unité avant l'introduction des portions.
   */
  readonly unit?: BaseUnit
  /**
   * Masse d'un millilitre, en grammes, pour une fiche mesurée en `ml`.
   *
   * Ciqual donne ses valeurs pour 100 g : un verre de lait de 200 ml en pèse
   * 206. Open Food Facts donne celles d'une boisson pour 100 ml : la densité
   * vaut alors 1, le référentiel étant déjà le millilitre.
   */
  readonly density?: number
  /** Portions nommées de la fiche, dans l'ordre où l'écran les propose. */
  readonly servings?: readonly Serving[]
}

/** Unité, densité et portions : ce qui dit comment une fiche se mesure. */
export interface FoodPortions {
  readonly unit: BaseUnit
  readonly density: number
  readonly servings: readonly Serving[]
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
    readonly ownerId: PlayerId | null = null,
    readonly unit: BaseUnit = BaseUnit.GRAM,
    readonly density: number = 1,
    readonly servings: readonly Serving[] = [],
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

    const portions = checkPortions(props)
    if (!portions.ok) return portions

    return ok(
      new FoodItem(
        props.id ?? newId<'FoodItemId'>(),
        name,
        props.macrosPer100g,
        props.detailPer100g ?? NutrientDetail.zero(),
        props.source,
        barcode,
        dedupeTags(props.tags ?? []),
        props.ownerId ?? null,
        portions.value.unit,
        portions.value.density,
        portions.value.servings,
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
      props.ownerId ?? null,
      props.unit ?? BaseUnit.GRAM,
      props.density ?? 1,
      props.servings ?? [],
    )
  }

  /** Mesure de base de la fiche : le gramme, ou le millilitre d'un liquide. */
  get baseMeasure(): Measure {
    return this.unit === BaseUnit.MILLILITRE ? millilitre(this.density) : GRAM
  }

  /** Toutes les façons de saisir une quantité de cet aliment, la mesure de base en tête. */
  get measures(): readonly Measure[] {
    return [this.baseMeasure, ...this.servings.map(servingMeasure)]
  }

  /**
   * La mesure qui porte ce nom, ou la mesure de base si aucune ne le porte :
   * une portion retirée de la fiche entre-temps ne doit pas empêcher d'ajouter
   * l'aliment, seulement le faire saisir autrement.
   */
  measureNamed(label: string | undefined): Measure {
    if (label === undefined) return this.baseMeasure
    return this.measures.find((measure) => measure.label === label) ?? this.baseMeasure
  }

  get portions(): FoodPortions {
    return { unit: this.unit, density: this.density, servings: this.servings }
  }

  /** Même fiche, autrement mesurée. */
  withPortions(portions: Partial<FoodPortions>): Result<FoodItem, InvalidFoodItemError> {
    const checked = checkPortions({ ...this.portions, ...portions })
    if (!checked.ok) return checked
    return ok(
      new FoodItem(
        this.id,
        this.name,
        this.macrosPer100g,
        this.detailPer100g,
        this.source,
        this.barcode,
        this.tags,
        this.ownerId,
        checked.value.unit,
        checked.value.density,
        checked.value.servings,
      ),
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

  /**
   * Seul un aliment créé à la main se modifie, et par son auteur. Une fiche
   * sans auteur date d'avant le partage et n'appartient qu'à cet appareil :
   * quiconque l'utilise peut la corriger. Ciqual et Open Food Facts sont des
   * références — les corriger ici serait défait au prochain rechargement.
   */
  isEditableBy(playerId: PlayerId | null): boolean {
    return this.source === FoodSource.USER && (this.ownerId === null || this.ownerId === playerId)
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
      this.ownerId,
      this.unit,
      this.density,
      this.servings,
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
      ownerId: this.ownerId,
      ...this.portions,
    })
  }

  equals(other: FoodItem): boolean {
    return this.id === other.id
  }
}

/**
 * Unité, densité et portions validées. Une densité n'a de sens que pour une
 * fiche mesurée en millilitres : elle est ramenée à 1 pour une fiche en grammes,
 * afin qu'une valeur égarée ne fausse aucune conversion.
 */
function checkPortions(
  props: Pick<FoodItemProps, 'unit' | 'density' | 'servings'>,
): Result<FoodPortions, InvalidFoodItemError> {
  const unit = props.unit ?? BaseUnit.GRAM
  const density = unit === BaseUnit.MILLILITRE ? (props.density ?? 1) : 1
  if (!isValidDensity(density)) {
    return err(new InvalidFoodItemError(`Densité invalide : ${props.density} g/ml.`))
  }
  const servings = validateServings(props.servings ?? [])
  if (!servings.ok) return servings
  return ok({ unit, density, servings: servings.value })
}

function dedupeTags(tags: readonly FoodTag[]): readonly FoodTag[] {
  return Object.freeze([...new Set(tags)])
}
