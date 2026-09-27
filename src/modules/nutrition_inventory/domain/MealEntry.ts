import { DomainError, InvalidMealError } from '@/core/errors'
import { type FoodItemId, type MealEntryId, newId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import type { FoodItem, FoodTag } from './FoodItem'

/**
 * Instantané figé de la fiche au moment de l'ajout.
 *
 * C'est la pièce centrale du module : sans elle, corriger une fiche Ciqual
 * réécrirait rétroactivement tous les repas historiques qui l'utilisent.
 */
export interface FoodSnapshot {
  readonly foodName: string
  readonly macros: Macros
  readonly detail: NutrientDetail
  readonly tags: readonly FoodTag[]
}

export interface MealEntryProps {
  readonly id: MealEntryId
  readonly foodItemId: FoodItemId
  readonly quantity: Quantity
  readonly snapshot: FoodSnapshot
}

/**
 * Une ligne de repas : un aliment, une portion, et les macros correspondantes
 * gelées à l'instant de la saisie.
 *
 * `MealEntry` ne détient **aucune** référence vers `FoodItem` : seulement son
 * identifiant, utile pour re-proposer l'aliment, jamais pour recalculer.
 */
export class MealEntry {
  private constructor(
    readonly id: MealEntryId,
    readonly foodItemId: FoodItemId,
    readonly quantity: Quantity,
    readonly snapshot: FoodSnapshot,
  ) {}

  /**
   * Seule fabrique légitime : elle lit la fiche une fois, met ses macros à
   * l'échelle de la portion, et n'en garde que le résultat.
   */
  static fromFoodItem(
    foodItem: FoodItem,
    quantity: Quantity,
    id?: MealEntryId,
  ): Result<MealEntry, DomainError> {
    const scaled = foodItem.macrosPer100g.scale(quantity.ratioTo100g)
    if (!scaled.ok) return err(scaled.error)

    const detail = foodItem.detailPer100g.scale(quantity.ratioTo100g)
    if (!detail.ok) return err(detail.error)

    return ok(
      new MealEntry(id ?? newId<'MealEntryId'>(), foodItem.id, quantity, {
        foodName: foodItem.name,
        macros: scaled.value,
        detail: detail.value,
        tags: [...foodItem.tags],
      }),
    )
  }

  static reconstitute(props: MealEntryProps): MealEntry {
    return new MealEntry(props.id, props.foodItemId, props.quantity, props.snapshot)
  }

  /** Macros de la ligne : lues sur l'instantané, jamais recalculées depuis le catalogue. */
  get macros(): Macros {
    return this.snapshot.macros
  }

  /** Nutriments complémentaires de la ligne, lus sur le même instantané figé. */
  get detail(): NutrientDetail {
    return this.snapshot.detail
  }

  get foodName(): string {
    return this.snapshot.foodName
  }

  calories(): number {
    return this.snapshot.macros.calories()
  }

  hasTag(tag: FoodTag): boolean {
    return this.snapshot.tags.includes(tag)
  }

  /**
   * Corriger la portion remet les macros à l'échelle **depuis l'instantané**, pas
   * depuis le catalogue : la fiche a pu changer entre-temps, la ligne reste cohérente
   * avec ce que le joueur a réellement saisi.
   */
  withQuantity(quantity: Quantity): Result<MealEntry, DomainError> {
    const factor = quantity.grams / this.quantity.grams
    const rescaled = this.snapshot.macros.scale(factor)
    if (!rescaled.ok) return err(rescaled.error)

    const rescaledDetail = this.snapshot.detail.scale(factor)
    if (!rescaledDetail.ok) return err(rescaledDetail.error)

    return ok(
      new MealEntry(this.id, this.foodItemId, quantity, {
        ...this.snapshot,
        macros: rescaled.value,
        detail: rescaledDetail.value,
      }),
    )
  }

  /**
   * La même ligne — même identifiant, même portion — recalculée depuis la fiche
   * telle qu'elle est aujourd'hui. Réservé aux repas encore prévus : c'est
   * `Meal.refreshFrom` qui en décide.
   */
  refreshedFrom(foodItem: FoodItem): Result<MealEntry, DomainError> {
    if (foodItem.id !== this.foodItemId) {
      return err(
        new InvalidMealError(`La fiche ${foodItem.id} ne correspond pas à la ligne ${this.id}.`),
      )
    }
    return MealEntry.fromFoodItem(foodItem, this.quantity, this.id)
  }

  /**
   * Même instantané, aux arrondis de calcul près : une portion corrigée est
   * remise à l'échelle depuis l'instantané, un rafraîchissement depuis la fiche,
   * et les deux chemins ne donnent pas toujours le même dernier bit.
   */
  hasSameSnapshotAs(other: MealEntry): boolean {
    const a = this.snapshot
    const b = other.snapshot
    return (
      a.foodName === b.foodName &&
      a.tags.length === b.tags.length &&
      a.tags.every((tag) => b.tags.includes(tag)) &&
      sameValues(a.macros.toJSON(), b.macros.toJSON()) &&
      sameValues(a.detail.toJSON(), b.detail.toJSON())
    )
  }

  equals(other: MealEntry): boolean {
    return this.id === other.id
  }
}

/** Écart en deçà duquel deux quantités de nutriment sont tenues pour égales, en grammes. */
const SNAPSHOT_TOLERANCE_G = 1e-6

function sameValues<T extends object>(a: T, b: T): boolean {
  return Object.keys(a).every(
    (key) =>
      Math.abs((a as Record<string, number>)[key]! - (b as Record<string, number>)[key]!) <
      SNAPSHOT_TOLERANCE_G,
  )
}
