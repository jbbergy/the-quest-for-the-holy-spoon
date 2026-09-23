import { dayKeyOf, parseDayKey } from '@/core/day'
import { idFrom } from '@/core/identity'
import { tokenize } from '@/core/infrastructure/text'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail, type NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'

import { FoodItem, type FoodSource, type FoodTag } from '../domain/FoodItem'
import { Meal, type MealType } from '../domain/Meal'
import { MealEntry } from '../domain/MealEntry'

/**
 * Traduction Entité ↔ enregistrement stocké.
 *
 * Les enregistrements sont des objets nus : IndexedDB les sérialise par
 * *structured clone*, qui ne sait pas reconstruire une instance de classe. Passer
 * par des mappers explicites évite de découvrir ce détail à la relecture, et
 * isole le schéma de stockage des refactorisations du domaine.
 */

export interface FoodRecord {
  readonly id: string
  readonly name: string
  readonly proteinG: number
  readonly carbsG: number
  readonly fatG: number
  /**
   * Nutriments complémentaires, **absents** des enregistrements écrits avant
   * leur introduction. Voir `detailOf` : l'absence se lit comme « non
   * renseigné », donc zéro, et non comme une donnée perdue.
   */
  readonly fiberG?: number
  readonly sugarsG?: number
  readonly saturatedFatG?: number
  readonly saltG?: number
  readonly source: FoodSource
  readonly barcode?: string
  readonly tags: readonly FoodTag[]
  /** Dérivé du nom, alimente l'index `multiEntry` de recherche. */
  readonly searchTokens: readonly string[]
}

export function foodToRecord(item: FoodItem): FoodRecord {
  return {
    id: item.id,
    name: item.name,
    proteinG: item.macrosPer100g.proteinG,
    carbsG: item.macrosPer100g.carbsG,
    fatG: item.macrosPer100g.fatG,
    fiberG: item.detailPer100g.fiberG,
    sugarsG: item.detailPer100g.sugarsG,
    saturatedFatG: item.detailPer100g.saturatedFatG,
    saltG: item.detailPer100g.saltG,
    source: item.source,
    // `exactOptionalPropertyTypes` interdit d'écrire `barcode: undefined` :
    // la clé doit être absente, sinon l'index IndexedDB indexerait `undefined`.
    ...(item.barcode === undefined ? {} : { barcode: item.barcode }),
    tags: [...item.tags],
    searchTokens: tokenize(item.name),
  }
}

export function recordToFood(record: FoodRecord): FoodItem {
  return FoodItem.reconstitute({
    id: idFrom(record.id),
    name: record.name,
    macrosPer100g: Macros.reconstitute({
      proteinG: record.proteinG,
      carbsG: record.carbsG,
      fatG: record.fatG,
    }),
    detailPer100g: detailOf(record),
    source: record.source,
    ...(record.barcode === undefined ? {} : { barcode: record.barcode }),
    tags: record.tags,
  })
}

export interface MealEntryRecord {
  readonly id: string
  readonly foodItemId: string
  readonly grams: number
  readonly foodName: string
  readonly proteinG: number
  readonly carbsG: number
  readonly fatG: number
  /** Mêmes clés facultatives que `FoodRecord`, pour la même raison d'historique. */
  readonly fiberG?: number
  readonly sugarsG?: number
  readonly saturatedFatG?: number
  readonly saltG?: number
  readonly tags: readonly FoodTag[]
}

export interface MealRecord {
  readonly id: string
  readonly playerId: string
  readonly type: MealType
  readonly loggedAt: string
  /**
   * Jour **prévu** du repas, `AAAA-MM-JJ` en heure locale, pour l'index
   * `[playerId, dayKey]`.
   *
   * Cette clé valait le jour de composition tant qu'on ne composait que pour le
   * jour même ; elle porte désormais le jour prévu. Aucune migration n'a été
   * nécessaire : pour tout repas écrit avant la planification, les deux
   * coïncident, et la clé déjà stockée *est* son jour prévu.
   */
  readonly dayKey: string
  /**
   * Date de consommation, `null` si le repas n'est que prévu.
   *
   * **Absent** des enregistrements écrits avant l'introduction de cet état ; la
   * relecture s'appuie sur cette absence, voir `consumedAtOf`.
   */
  readonly consumedAt?: string | null
  readonly entries: readonly MealEntryRecord[]
}

export function mealToRecord(meal: Meal): MealRecord {
  return {
    id: meal.id,
    playerId: meal.playerId,
    type: meal.type,
    loggedAt: meal.loggedAt.toISOString(),
    dayKey: meal.plannedFor,
    consumedAt: meal.consumedAt === null ? null : meal.consumedAt.toISOString(),
    entries: meal.entries.map((entry) => ({
      id: entry.id,
      foodItemId: entry.foodItemId,
      grams: entry.quantity.grams,
      foodName: entry.snapshot.foodName,
      proteinG: entry.snapshot.macros.proteinG,
      carbsG: entry.snapshot.macros.carbsG,
      fatG: entry.snapshot.macros.fatG,
      fiberG: entry.snapshot.detail.fiberG,
      sugarsG: entry.snapshot.detail.sugarsG,
      saturatedFatG: entry.snapshot.detail.saturatedFatG,
      saltG: entry.snapshot.detail.saltG,
      tags: [...entry.snapshot.tags],
    })),
  }
}

/**
 * Reconstitue les nutriments complémentaires d'un enregistrement.
 *
 * Les quatre clés manquent sur tout ce qui a été écrit avant leur introduction,
 * et rien ne permet de les retrouver : un repas historique a figé l'instantané
 * d'une fiche qui, à l'époque, ne portait ni fibres ni sel. Zéro est donc la
 * seule valeur honnête — pas une estimation rétroactive, qui inventerait des
 * apports que l'utilisateur n'a jamais saisis.
 */
function detailOf(record: Partial<NutrientDetailProps>): NutrientDetail {
  return NutrientDetail.reconstitute({
    fiberG: record.fiberG ?? 0,
    sugarsG: record.sugarsG ?? 0,
    saturatedFatG: record.saturatedFatG ?? 0,
    saltG: record.saltG ?? 0,
  })
}

/**
 * Reconstitue la date de consommation, en tenant compte de l'historique.
 *
 * Un enregistrement sans la clé `consumedAt` date d'avant la distinction entre
 * « prévu » et « pris » : à l'époque, enregistrer un repas *signifiait* l'avoir
 * mangé. Le relire comme simplement prévu retirerait rétroactivement des jauges
 * tout l'historique de l'utilisateur, ce qu'aucune migration ne devrait faire.
 */
function consumedAtOf(record: MealRecord): Date | null {
  if (record.consumedAt === undefined) return new Date(record.loggedAt)
  return record.consumedAt === null ? null : new Date(record.consumedAt)
}

export function recordToMeal(record: MealRecord): Meal {
  return Meal.reconstitute({
    id: idFrom(record.id),
    playerId: idFrom(record.playerId),
    type: record.type,
    loggedAt: new Date(record.loggedAt),
    // La clé est écrite par `mealToRecord` et donc toujours valide ; le repli ne
    // couvre qu'un enregistrement abîmé, qu'on range alors au jour de sa création
    // plutôt que de rendre tout le journal illisible.
    plannedFor: parseDayKey(record.dayKey) ?? dayKeyOf(new Date(record.loggedAt)),
    consumedAt: consumedAtOf(record),
    entries: record.entries.map((entry) =>
      MealEntry.reconstitute({
        id: idFrom(entry.id),
        foodItemId: idFrom(entry.foodItemId),
        quantity: Quantity.reconstitute(entry.grams),
        snapshot: {
          foodName: entry.foodName,
          macros: Macros.reconstitute({
            proteinG: entry.proteinG,
            carbsG: entry.carbsG,
            fatG: entry.fatG,
          }),
          detail: detailOf(entry),
          tags: entry.tags,
        },
      }),
    ),
  })
}
