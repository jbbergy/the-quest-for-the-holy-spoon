import { ApplicationError } from '@/core/errors'
import type { DayKey } from '@/core/day'
import type { MealId, PlayerId, RecipeId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import { Quantity } from '@/core/nutrition/Quantity'

import { Meal, type MealType } from '../domain/Meal'
import { MealEntry } from '../domain/MealEntry'
import { Recipe } from '../domain/Recipe'
import type { IFoodRepository, IMealRepository, IRecipeRepository } from '../domain/repositories'

import { type RecipeSummary, toRecipeSummary } from './readModels'
import { type InventoryError, loadMeal, saveMeal } from './useCases'

// --- Recettes ----------------------------------------------------------------

/** Les recettes d'un joueur, par ordre alphabétique. */
export class ListRecipesUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(playerId: PlayerId): Promise<Result<RecipeSummary[], InventoryError>> {
    const found = await this.recipes.findByPlayer(playerId)
    if (!found.ok) return err(unreadable(found.error))
    return ok(found.value.map(toRecipeSummary))
  }
}

/**
 * Garde un repas sous forme de recette : c'est ainsi qu'on en crée. On compose
 * le poke bowl une première fois, puis on l'enregistre ; la fois suivante, on
 * choisit la recette au lieu de ressaisir chaque ingrédient.
 *
 * Le repas n'est pas modifié, et reste modifiable ou supprimable : la recette
 * en garde sa propre copie des ingrédients.
 */
export class SaveMealAsRecipeUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly recipes: IRecipeRepository,
  ) {}

  async execute(mealId: MealId, name: string): Promise<Result<RecipeSummary, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const recipe = Recipe.fromMeal(meal.value, name)
    if (!recipe.ok) return recipe

    const free = await ensureNameFree(this.recipes, recipe.value)
    if (!free.ok) return free

    const saved = await persist(this.recipes, recipe.value)
    if (!saved.ok) return saved
    return ok(toRecipeSummary(recipe.value))
  }
}

export class GetRecipeUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(recipeId: RecipeId): Promise<Result<RecipeSummary, InventoryError>> {
    const recipe = await loadRecipe(this.recipes, recipeId)
    return recipe.ok ? ok(toRecipeSummary(recipe.value)) : recipe
  }
}

export class RenameRecipeUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(recipeId: RecipeId, name: string): Promise<Result<RecipeSummary, InventoryError>> {
    const recipe = await loadRecipe(this.recipes, recipeId)
    if (!recipe.ok) return recipe

    const renamed = recipe.value.rename(name)
    if (!renamed.ok) return renamed

    const free = await ensureNameFree(this.recipes, renamed.value)
    if (!free.ok) return free

    const saved = await persist(this.recipes, renamed.value)
    return saved.ok ? ok(toRecipeSummary(renamed.value)) : saved
  }
}

/**
 * Corrige la quantité d'un ingrédient. Les repas déjà composés avec la recette
 * ne changent pas : ils ont leurs propres lignes.
 */
export class ChangeRecipeLineQuantityUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(
    recipeId: RecipeId,
    lineIndex: number,
    grams: number,
  ): Promise<Result<RecipeSummary, InventoryError>> {
    const quantity = Quantity.create(grams)
    if (!quantity.ok) return quantity

    const recipe = await loadRecipe(this.recipes, recipeId)
    if (!recipe.ok) return recipe

    const changed = recipe.value.withLineQuantity(lineIndex, quantity.value)
    if (!changed.ok) return changed

    const saved = await persist(this.recipes, changed.value)
    return saved.ok ? ok(toRecipeSummary(changed.value)) : saved
  }
}

export class RemoveRecipeLineUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(recipeId: RecipeId, lineIndex: number): Promise<Result<RecipeSummary, InventoryError>> {
    const recipe = await loadRecipe(this.recipes, recipeId)
    if (!recipe.ok) return recipe

    const changed = recipe.value.withoutLine(lineIndex)
    if (!changed.ok) return changed

    const saved = await persist(this.recipes, changed.value)
    return saved.ok ? ok(toRecipeSummary(changed.value)) : saved
  }
}

/** Les repas déjà composés avec la recette ne changent pas : ils ont leurs propres lignes. */
export class DeleteRecipeUseCase {
  constructor(private readonly recipes: IRecipeRepository) {}

  async execute(recipeId: RecipeId): Promise<Result<void, InventoryError>> {
    const deleted = await this.recipes.delete(recipeId)
    if (!deleted.ok) {
      return err(
        new ApplicationError('RECIPE_NOT_SAVED', 'La recette n’a pas pu être supprimée.', {
          cause: deleted.error,
        }),
      )
    }
    return ok(undefined)
  }
}

export interface AddRecipeInput {
  readonly playerId: PlayerId
  readonly recipeId: RecipeId
  readonly mealType: MealType
  /** Repas existant à compléter ; un nouveau repas est créé si absent. */
  readonly mealId?: MealId
  /** Jour d'un **nouveau** repas ; aujourd'hui si absent. Ignoré pour un repas existant. */
  readonly plannedFor?: DayKey
}

export interface AddRecipeResult {
  readonly meal: Meal
  readonly added: number
  /** Ingrédients dont l'aliment n'existe plus dans le catalogue, ajoutés à personne. */
  readonly missing: readonly string[]
}

/**
 * Ajoute tous les ingrédients d'une recette à un repas, en une seule écriture.
 *
 * Chaque ligne relit la fiche **d'aujourd'hui** et en fige un instantané, comme
 * pour un aliment ajouté à la main : une recette ne fige pas les valeurs
 * nutritionnelles, et un aliment corrigé depuis y est pris en compte. Un aliment
 * disparu du catalogue (un aliment perso supprimé) est sauté et nommé, plutôt
 * que de faire échouer le reste de la recette.
 */
export class AddRecipeToMealUseCase {
  constructor(
    private readonly recipes: IRecipeRepository,
    private readonly foods: IFoodRepository,
    private readonly meals: IMealRepository,
  ) {}

  async execute(input: AddRecipeInput): Promise<Result<AddRecipeResult, InventoryError>> {
    const recipe = await loadRecipe(this.recipes, input.recipeId)
    if (!recipe.ok) return recipe
    if (recipe.value.playerId !== input.playerId) {
      return err(new ApplicationError('NOT_OWNER', `La recette ${input.recipeId} appartient à un autre profil.`))
    }

    const entries: MealEntry[] = []
    const missing: string[] = []
    for (const line of recipe.value.lines) {
      const food = await this.foods.findById(line.foodItemId)
      if (!food.ok) {
        return err(
          new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
            cause: food.error,
          }),
        )
      }
      if (food.value === null) {
        missing.push(line.foodName)
        continue
      }
      const entry = MealEntry.fromFoodItem(
        food.value,
        line.quantity,
        undefined,
        food.value.measureNamed(line.measure.label),
      )
      if (!entry.ok) return entry
      entries.push(entry.value)
    }

    if (entries.length === 0) {
      return err(
        new ApplicationError(
          'RECIPE_FOODS_MISSING',
          'Aucun ingrédient de cette recette n’est plus dans le catalogue.',
        ),
      )
    }

    const base = await this.resolveMeal(input)
    if (!base.ok) return base

    let meal = base.value
    for (const entry of entries) {
      const next = meal.addEntry(entry)
      if (!next.ok) return next
      meal = next.value
    }

    const saved = await saveMeal(this.meals, meal)
    if (!saved.ok) return saved
    return ok({ meal, added: entries.length, missing })
  }

  private async resolveMeal(input: AddRecipeInput): Promise<Result<Meal, InventoryError>> {
    if (input.mealId !== undefined) return loadMeal(this.meals, input.mealId)
    return Meal.create({
      playerId: input.playerId,
      type: input.mealType,
      ...(input.plannedFor === undefined ? {} : { plannedFor: input.plannedFor }),
    })
  }
}

async function loadRecipe(
  recipes: IRecipeRepository,
  recipeId: RecipeId,
): Promise<Result<Recipe, InventoryError>> {
  const found = await recipes.findById(recipeId)
  if (!found.ok) return err(unreadable(found.error))
  if (found.value === null) {
    return err(new ApplicationError('RECIPE_NOT_FOUND', `Aucune recette ne correspond à ${recipeId}.`))
  }
  return ok(found.value)
}

async function persist(
  recipes: IRecipeRepository,
  recipe: Recipe,
): Promise<Result<void, InventoryError>> {
  const saved = await recipes.save(recipe)
  if (saved.ok) return ok(undefined)
  return err(
    new ApplicationError('RECIPE_NOT_SAVED', 'La recette n’a pas pu être enregistrée.', {
      cause: saved.error,
    }),
  )
}

/**
 * Deux recettes du même nom ne se distingueraient pas dans les listes, et un
 * double appui sur « Enregistrer » en créerait une deuxième. Une recette ne
 * s'oppose pas à elle-même : la renommer en changeant seulement la casse passe.
 */
async function ensureNameFree(
  recipes: IRecipeRepository,
  recipe: Recipe,
): Promise<Result<void, InventoryError>> {
  const existing = await recipes.findByPlayer(recipe.playerId)
  if (!existing.ok) return err(unreadable(existing.error))
  if (existing.value.some((other) => other.id !== recipe.id && sameName(other.name, recipe.name))) {
    return err(
      new ApplicationError('RECIPE_NAME_TAKEN', `Une recette s’appelle déjà « ${recipe.name} ».`),
    )
  }
  return ok(undefined)
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0
}

function unreadable(cause: Error): ApplicationError {
  return new ApplicationError('RECIPE_UNREADABLE', 'Les recettes n’ont pas pu être relues.', { cause })
}
