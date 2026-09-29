import { InvalidRecipeError } from '@/core/errors'
import { type FoodItemId, newId, type PlayerId, type RecipeId } from '@/core/identity'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import type { Meal } from './Meal'
import { amountIn, type Measure } from './Measure'

export const MAX_RECIPE_NAME_LENGTH = 60
export const MAX_RECIPE_LINES = 100

/**
 * Un ingrédient d'une recette : un aliment et sa quantité.
 *
 * Contrairement à une ligne de repas, une recette **ne fige pas** les valeurs
 * nutritionnelles : elle ne garde que de quoi retrouver l'aliment. Le repas qui
 * l'utilise lira la fiche telle qu'elle est ce jour-là et en figera son propre
 * instantané. Le nom est mémorisé pour pouvoir afficher la recette, et nommer
 * ce qui manque si l'aliment a disparu du catalogue entre-temps.
 */
export interface RecipeLine {
  readonly foodItemId: FoodItemId
  readonly foodName: string
  readonly quantity: Quantity
  /** Mesure de saisie : « 2 tranches » se relit « 2 tranches ». */
  readonly measure: Measure
}

export interface RecipeProps {
  readonly id: RecipeId
  readonly playerId: PlayerId
  readonly name: string
  readonly lines: readonly RecipeLine[]
}

function cleanName(raw: string): Result<string, InvalidRecipeError> {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name === '' || name.length > MAX_RECIPE_NAME_LENGTH) {
    return err(
      new InvalidRecipeError(`Le nom d’une recette doit avoir de 1 à ${MAX_RECIPE_NAME_LENGTH} lettres.`),
    )
  }
  return ok(name)
}

function noSuchLine(index: number): InvalidRecipeError {
  return new InvalidRecipeError(`Aucun ingrédient n° ${index + 1} dans cette recette.`)
}

/**
 * Une recette : un nom et une liste d'ingrédients avec leurs quantités, à
 * réutiliser dans un repas. « Poke bowl » = riz, saumon, avocat, edamame…
 *
 * Elle appartient à un profil, comme un repas ; elle voyage avec son compte.
 * Immuable, comme `Meal` : chaque modification rend une nouvelle recette.
 */
export class Recipe {
  private constructor(
    readonly id: RecipeId,
    readonly playerId: PlayerId,
    readonly name: string,
    readonly lines: readonly RecipeLine[],
  ) {}

  /**
   * Fabrique une recette à partir des lignes d'un repas : c'est ainsi qu'on en
   * crée, en composant le repas une première fois puis en le gardant.
   */
  static fromMeal(meal: Meal, name: string, id?: RecipeId): Result<Recipe, InvalidRecipeError> {
    return Recipe.create({
      playerId: meal.playerId,
      name,
      lines: meal.entries.map((entry) => ({
        foodItemId: entry.foodItemId,
        foodName: entry.foodName,
        quantity: entry.quantity,
        measure: entry.measure,
      })),
      ...(id === undefined ? {} : { id }),
    })
  }

  static create(props: {
    readonly playerId: PlayerId
    readonly name: string
    readonly lines: readonly RecipeLine[]
    readonly id?: RecipeId
  }): Result<Recipe, InvalidRecipeError> {
    const name = cleanName(props.name)
    if (!name.ok) return name

    if (props.lines.length === 0) {
      return err(new InvalidRecipeError('Une recette doit contenir au moins un ingrédient.'))
    }
    if (props.lines.length > MAX_RECIPE_LINES) {
      return err(new InvalidRecipeError(`Une recette ne peut pas dépasser ${MAX_RECIPE_LINES} ingrédients.`))
    }

    return ok(
      new Recipe(
        props.id ?? newId<'RecipeId'>(),
        props.playerId,
        name.value,
        Object.freeze(props.lines.map((line) => ({ ...line }))),
      ),
    )
  }

  static reconstitute(props: RecipeProps): Recipe {
    return new Recipe(props.id, props.playerId, props.name, Object.freeze([...props.lines]))
  }

  rename(raw: string): Result<Recipe, InvalidRecipeError> {
    const name = cleanName(raw)
    if (!name.ok) return name
    return ok(new Recipe(this.id, this.playerId, name.value, this.lines))
  }

  /** Change la quantité d'un ingrédient, gardée dans sa mesure de saisie. */
  withLineQuantity(index: number, quantity: Quantity): Result<Recipe, InvalidRecipeError> {
    const line = this.lines[index]
    if (line === undefined) return err(noSuchLine(index))
    const lines = this.lines.map((other, position) => (position === index ? { ...line, quantity } : other))
    return ok(new Recipe(this.id, this.playerId, this.name, Object.freeze(lines)))
  }

  /** Retire un ingrédient. Le dernier ne se retire pas : une recette vide se supprime. */
  withoutLine(index: number): Result<Recipe, InvalidRecipeError> {
    if (this.lines[index] === undefined) return err(noSuchLine(index))
    if (this.lines.length === 1) {
      return err(new InvalidRecipeError('Une recette doit contenir au moins un ingrédient.'))
    }
    const lines = this.lines.filter((_, position) => position !== index)
    return ok(new Recipe(this.id, this.playerId, this.name, Object.freeze(lines)))
  }
}

/** Quantité d'un ingrédient dans sa mesure de saisie : 2 pour « 2 tranches ». */
export function lineAmount(line: RecipeLine): number {
  return amountIn(line.measure, line.quantity.grams)
}
