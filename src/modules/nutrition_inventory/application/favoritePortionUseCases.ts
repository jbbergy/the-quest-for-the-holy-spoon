/**
 * Use Cases des portions favorites : la quantité qu'on prend d'habitude d'un
 * aliment, gardée pour la choisir d'un geste.
 */
import { ApplicationError, type RepositoryError } from '@/core/errors'
import type { FoodItemId, PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import { FavoritePortion, MAX_FAVORITE_PORTIONS_PER_FOOD } from '../domain/FavoritePortion'
import type { IFavoritePortionRepository } from '../domain/repositories'

import { type FavoritePortionSummary, toFavoritePortionSummary } from './readModels'
import type { InventoryError } from './shared'

/** Les portions favorites d'un joueur, par aliment, de la plus petite à la plus grande. */
export type FavoritePortionsByFood = ReadonlyMap<FoodItemId, readonly FavoritePortionSummary[]>

export interface FavoritePortionInput {
  readonly playerId: PlayerId
  readonly foodItemId: FoodItemId
  readonly grams: number
  /** Nom de la mesure de saisie : « g », « tranche ». */
  readonly measure: string
}

/**
 * Toutes les portions favorites d'un joueur, en une lecture : l'éditeur de
 * repas la fait à l'ouverture, puis chaque aliment choisi n'est plus qu'une
 * consultation.
 *
 * Deux appareils peuvent avoir gardé la même portion chacun de leur côté : elle
 * n'est proposée qu'une fois.
 */
export class ListFavoritePortionsUseCase {
  constructor(private readonly portions: IFavoritePortionRepository) {}

  async execute(playerId: PlayerId): Promise<Result<FavoritePortionsByFood, InventoryError>> {
    const found = await this.portions.findByPlayer(playerId)
    if (!found.ok) return err(unreadable(found.error))

    const byFood = new Map<FoodItemId, FavoritePortion[]>()
    for (const portion of found.value) {
      const kept = byFood.get(portion.foodItemId) ?? []
      if (kept.some((other) => other.isSameAs(summaryOf(portion)))) continue
      byFood.set(portion.foodItemId, [...kept, portion])
    }

    return ok(
      new Map(
        [...byFood].map(([foodItemId, portions]) => [
          foodItemId,
          portions
            .sort((a, b) => a.quantity.grams - b.quantity.grams)
            .map(toFavoritePortionSummary),
        ]),
      ),
    )
  }
}

/**
 * Garde une portion en favori. La garder deux fois ne fait rien de plus : elle
 * est déjà là. Au-delà de cinq par aliment, elle est refusée — la rangée ne
 * serait plus un choix rapide.
 */
export class AddFavoritePortionUseCase {
  constructor(private readonly portions: IFavoritePortionRepository) {}

  async execute(input: FavoritePortionInput): Promise<Result<FavoritePortionSummary, InventoryError>> {
    const portion = FavoritePortion.create(input)
    if (!portion.ok) return portion

    const found = await this.portions.findByPlayer(input.playerId)
    if (!found.ok) return err(unreadable(found.error))

    const sameFood = found.value.filter((other) => other.foodItemId === input.foodItemId)
    const existing = sameFood.find((other) => other.isSameAs(input))
    if (existing !== undefined) return ok(toFavoritePortionSummary(existing))

    if (sameFood.length >= MAX_FAVORITE_PORTIONS_PER_FOOD) {
      return err(
        new ApplicationError(
          'FAVORITE_PORTIONS_FULL',
          `Un aliment a au plus ${MAX_FAVORITE_PORTIONS_PER_FOOD} portions favorites.`,
        ),
      )
    }

    const saved = await this.portions.save(portion.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('FAVORITE_PORTION_NOT_SAVED', 'La portion favorite n’a pas pu être enregistrée.', {
          cause: saved.error,
        }),
      )
    }
    return ok(toFavoritePortionSummary(portion.value))
  }
}

/**
 * Retire une portion des favoris. Désignée par sa valeur plutôt que par son
 * identifiant : si deux appareils l'avaient gardée chacun, elle part des deux.
 */
export class RemoveFavoritePortionUseCase {
  constructor(private readonly portions: IFavoritePortionRepository) {}

  async execute(input: FavoritePortionInput): Promise<Result<void, InventoryError>> {
    const found = await this.portions.findByPlayer(input.playerId)
    if (!found.ok) return err(unreadable(found.error))

    const doomed = found.value.filter(
      (portion) => portion.foodItemId === input.foodItemId && portion.isSameAs(input),
    )
    for (const portion of doomed) {
      const deleted = await this.portions.delete(portion.id)
      if (!deleted.ok) {
        return err(
          new ApplicationError('FAVORITE_PORTION_NOT_SAVED', 'La portion favorite n’a pas pu être retirée.', {
            cause: deleted.error,
          }),
        )
      }
    }
    return ok(undefined)
  }
}

function summaryOf(portion: FavoritePortion): { readonly grams: number; readonly measure: string } {
  return { grams: portion.quantity.grams, measure: portion.measure }
}

function unreadable(cause: RepositoryError): ApplicationError {
  return new ApplicationError('FAVORITE_PORTIONS_UNREADABLE', 'Les portions favorites n’ont pas pu être lues.', {
    cause,
  })
}
