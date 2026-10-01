import { InvalidFavoritePortionError } from '@/core/errors'
import { type FavoritePortionId, type FoodItemId, newId, type PlayerId } from '@/core/identity'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

/** Au-delà, la rangée de portions favorites ne serait plus un choix rapide. */
export const MAX_FAVORITE_PORTIONS_PER_FOOD = 5
export const MAX_MEASURE_LABEL_LENGTH = 40

export interface FavoritePortionProps {
  readonly id: FavoritePortionId
  readonly playerId: PlayerId
  readonly foodItemId: FoodItemId
  readonly quantity: Quantity
  /** Nom de la mesure de saisie — « tranche », « g » —, pour la reproposer telle quelle. */
  readonly measure: string
}

/**
 * Une portion favorite : la quantité qu'une personne prend d'habitude d'un
 * aliment, gardée pour la choisir d'un geste la prochaine fois. « 2 tranches »
 * de pain, « 150 g » de riz.
 *
 * Une par enregistrement, plutôt qu'une liste par aliment : deux appareils qui
 * en ajoutent chacun une hors ligne les retrouvent toutes les deux après la
 * synchronisation, au lieu que la seconde liste écrase la première.
 *
 * Comme une recette, elle ne fige rien de la fiche : seulement la quantité, en
 * grammes, et le nom de la mesure dans laquelle elle a été saisie.
 */
export class FavoritePortion {
  private constructor(
    readonly id: FavoritePortionId,
    readonly playerId: PlayerId,
    readonly foodItemId: FoodItemId,
    readonly quantity: Quantity,
    readonly measure: string,
  ) {}

  static create(props: {
    readonly playerId: PlayerId
    readonly foodItemId: FoodItemId
    readonly grams: number
    readonly measure: string
    readonly id?: FavoritePortionId
  }): Result<FavoritePortion, InvalidFavoritePortionError> {
    const quantity = Quantity.create(props.grams)
    if (!quantity.ok) return err(new InvalidFavoritePortionError(quantity.error.message))

    const measure = props.measure.trim()
    if (measure === '' || measure.length > MAX_MEASURE_LABEL_LENGTH) {
      return err(
        new InvalidFavoritePortionError(
          `Le nom de la mesure doit avoir de 1 à ${MAX_MEASURE_LABEL_LENGTH} lettres.`,
        ),
      )
    }

    return ok(
      new FavoritePortion(
        props.id ?? newId<'FavoritePortionId'>(),
        props.playerId,
        props.foodItemId,
        quantity.value,
        measure,
      ),
    )
  }

  static reconstitute(props: FavoritePortionProps): FavoritePortion {
    return new FavoritePortion(props.id, props.playerId, props.foodItemId, props.quantity, props.measure)
  }

  /**
   * Même portion : même mesure, même quantité au centième de gramme près —
   * « 1 tranche » convertie en grammes puis relue ne doit pas compter pour une
   * autre portion.
   */
  isSameAs(portion: { readonly grams: number; readonly measure: string }): boolean {
    return this.measure === portion.measure && Math.abs(this.quantity.grams - portion.grams) < 0.01
  }
}
