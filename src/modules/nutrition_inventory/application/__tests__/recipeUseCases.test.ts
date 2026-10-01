import { beforeEach, describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { Quantity } from '@/core/nutrition/Quantity'
import {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  MarkMealConsumedUseCase,
} from '@/modules/nutrition_inventory/application'
import {
  AddRecipeToMealUseCase,
  ChangeRecipeLineQuantityUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  ListRecipesUseCase,
  RemoveRecipeLineUseCase,
  RenameRecipeUseCase,
  SaveMealAsRecipeUseCase,
} from '@/modules/nutrition_inventory/application/recipeUseCases'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { MealType } from '@/modules/nutrition_inventory/domain/Meal'
import {
  InMemoryFoodRepository,
  InMemoryMealRepository,
  InMemoryRecipeRepository,
} from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'

const playerId: PlayerId = idFrom('player-1')

const rice = FoodItem.reconstitute({
  id: idFrom('ciqual:39212'),
  name: 'Riz cuit',
  macrosPer100g: Macros.reconstitute({ proteinG: 2.5, carbsG: 28, fatG: 0.3 }),
  source: FoodSource.CIQUAL,
})
const salmon = FoodItem.reconstitute({
  id: idFrom('ciqual:26036'),
  name: 'Saumon cru',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 13 }),
  source: FoodSource.CIQUAL,
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

let foods: InMemoryFoodRepository
let meals: InMemoryMealRepository
let recipes: InMemoryRecipeRepository

let addFood: AddFoodToMealUseCase
let save: SaveMealAsRecipeUseCase
let addRecipe: AddRecipeToMealUseCase

/** Compose un repas de riz et de saumon, puis le garde comme recette. */
async function pokeBowl() {
  const first = unwrap(
    await addFood.execute({ playerId, foodItemId: rice.id, grams: 150, mealType: MealType.LUNCH }),
  )
  const meal = unwrap(
    await addFood.execute({
      playerId,
      foodItemId: salmon.id,
      grams: 100,
      mealType: MealType.LUNCH,
      mealId: first.id,
    }),
  )
  return { meal, recipe: unwrap(await save.execute(meal.id, 'Poke bowl')) }
}

beforeEach(async () => {
  foods = new InMemoryFoodRepository()
  meals = new InMemoryMealRepository()
  recipes = new InMemoryRecipeRepository()
  await foods.saveMany([rice, salmon])

  addFood = new AddFoodToMealUseCase(foods, meals)
  save = new SaveMealAsRecipeUseCase(meals, recipes)
  addRecipe = new AddRecipeToMealUseCase(recipes, foods, meals)
})

describe('SaveMealAsRecipeUseCase', () => {
  it('garde les aliments et les quantités du repas', async () => {
    const { recipe } = await pokeBowl()

    expect(recipe.name).toBe('Poke bowl')
    expect(recipe.lines.map((line) => [line.foodName, line.grams])).toEqual([
      ['Riz cuit', 150],
      ['Saumon cru', 100],
    ])
  })

  it('laisse le repas d’origine tel quel', async () => {
    const { meal } = await pokeBowl()

    const unchanged = unwrap(await meals.findById(meal.id))
    expect(unchanged?.entries).toHaveLength(2)
  })

  it('refuse un nom déjà pris, sans tenir compte des majuscules ni des accents', async () => {
    const { meal } = await pokeBowl()

    const accented = await save.execute(meal.id, ' POKÉ bowl ')
    const lower = await save.execute(meal.id, 'poke bowl')

    expect(accented.ok ? null : accented.error.code).toBe('RECIPE_NAME_TAKEN')
    expect(lower.ok ? null : lower.error.code).toBe('RECIPE_NAME_TAKEN')
    expect(unwrap(await recipes.findByPlayer(playerId))).toHaveLength(1)
  })

  it('refuse un nom vide et un repas inconnu', async () => {
    const { meal } = await pokeBowl()

    const noName = await save.execute(meal.id, '  ')
    const unknown = await save.execute(idFrom('inconnu'), 'Poke bowl')

    expect(noName.ok ? null : noName.error.code).toBe('INVALID_RECIPE')
    expect(unknown.ok ? null : unknown.error.code).toBe('MEAL_NOT_FOUND')
  })
})

describe('ListRecipesUseCase', () => {
  it('rend les recettes du joueur par ordre alphabétique, et pas celles des autres', async () => {
    const { meal } = await pokeBowl()
    unwrap(await save.execute(meal.id, 'Assiette'))
    const other = unwrap(
      await addFood.execute({
        playerId: idFrom('player-2'),
        foodItemId: rice.id,
        grams: 100,
        mealType: MealType.DINNER,
      }),
    )
    unwrap(await save.execute(other.id, 'Riz de l’autre'))

    const listed = unwrap(await new ListRecipesUseCase(recipes).execute(playerId))

    expect(listed.map((recipe) => recipe.name)).toEqual(['Assiette', 'Poke bowl'])
  })
})

describe('AddRecipeToMealUseCase', () => {
  it('crée un repas avec tous les ingrédients, en une écriture', async () => {
    const { recipe } = await pokeBowl()

    const result = unwrap(
      await addRecipe.execute({
        playerId,
        recipeId: recipe.recipeId,
        mealType: MealType.DINNER,
        plannedFor: '2026-10-03' as never,
      }),
    )

    expect(result.added).toBe(2)
    expect(result.missing).toEqual([])
    expect(result.meal.type).toBe(MealType.DINNER)
    expect(result.meal.plannedFor).toBe('2026-10-03')
    expect(result.meal.entries.map((entry) => entry.foodName)).toEqual(['Riz cuit', 'Saumon cru'])
    expect(unwrap(await meals.findById(result.meal.id))?.entryCount).toBe(2)
  })

  it('complète un repas existant', async () => {
    const { meal, recipe } = await pokeBowl()

    const result = unwrap(
      await addRecipe.execute({
        playerId,
        recipeId: recipe.recipeId,
        mealType: meal.type,
        mealId: meal.id,
      }),
    )

    expect(result.meal.id).toBe(meal.id)
    expect(result.meal.entryCount).toBe(4)
  })

  it('lit la fiche d’aujourd’hui et non celle du jour où la recette a été gardée', async () => {
    const { recipe } = await pokeBowl()
    await foods.save(
      FoodItem.reconstitute({
        id: rice.id,
        name: 'Riz cuit',
        macrosPer100g: Macros.reconstitute({ proteinG: 5, carbsG: 28, fatG: 0.3 }),
        source: FoodSource.CIQUAL,
      }),
    )

    const result = unwrap(
      await addRecipe.execute({ playerId, recipeId: recipe.recipeId, mealType: MealType.LUNCH }),
    )

    const riceLine = result.meal.entries.find((entry) => entry.foodItemId === rice.id)!
    expect(riceLine.macros.proteinG).toBeCloseTo(7.5) // 150 g à 5 g / 100 g
  })

  it('saute et nomme un aliment disparu du catalogue', async () => {
    const { recipe } = await pokeBowl()
    await foods.delete(salmon.id)

    const result = unwrap(
      await addRecipe.execute({ playerId, recipeId: recipe.recipeId, mealType: MealType.LUNCH }),
    )

    expect(result.added).toBe(1)
    expect(result.missing).toEqual(['Saumon cru'])
    expect(result.meal.entries.map((entry) => entry.foodName)).toEqual(['Riz cuit'])
  })

  it('n’écrit rien quand plus aucun aliment n’existe', async () => {
    const { recipe } = await pokeBowl()
    await foods.delete(rice.id)
    await foods.delete(salmon.id)

    const result = await addRecipe.execute({
      playerId,
      recipeId: recipe.recipeId,
      mealType: MealType.DINNER,
    })

    expect(result.ok ? null : result.error.code).toBe('RECIPE_FOODS_MISSING')
    expect(unwrap(await meals.findByPlayerAndDay(playerId, new Date()))).toHaveLength(1)
  })

  it('refuse une recette inconnue ou d’un autre profil', async () => {
    const { recipe } = await pokeBowl()

    const unknown = await addRecipe.execute({
      playerId,
      recipeId: idFrom('inconnue'),
      mealType: MealType.LUNCH,
    })
    const foreign = await addRecipe.execute({
      playerId: idFrom('player-2'),
      recipeId: recipe.recipeId,
      mealType: MealType.LUNCH,
    })

    expect(unknown.ok ? null : unknown.error.code).toBe('RECIPE_NOT_FOUND')
    expect(foreign.ok ? null : foreign.error.code).toBe('NOT_OWNER')
  })

  it('refuse d’ajouter à un repas déjà mangé', async () => {
    const { meal, recipe } = await pokeBowl()
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))

    const result = await addRecipe.execute({
      playerId,
      recipeId: recipe.recipeId,
      mealType: meal.type,
      mealId: meal.id,
    })

    expect(result.ok).toBe(false)
  })

  it('donne à chaque repas ses propres lignes : corriger l’un ne touche ni l’autre ni la recette', async () => {
    const { recipe } = await pokeBowl()
    const first = unwrap(
      await addRecipe.execute({ playerId, recipeId: recipe.recipeId, mealType: MealType.DINNER }),
    )

    const entry = first.meal.entries[0]!
    unwrap(
      await new ChangeMealEntryQuantityUseCase(meals).execute(first.meal.id, entry.id, 300),
    )
    const second = unwrap(
      await addRecipe.execute({ playerId, recipeId: recipe.recipeId, mealType: MealType.SNACK }),
    )

    expect(second.meal.entries[0]!.quantity).toEqual(Quantity.reconstitute(150))
    expect(second.meal.entries.map((line) => line.id)).not.toContain(entry.id)
  })
})

describe('DeleteRecipeUseCase', () => {
  it('supprime la recette sans toucher aux repas déjà composés', async () => {
    const { meal, recipe } = await pokeBowl()

    unwrap(await new DeleteRecipeUseCase(recipes).execute(recipe.recipeId))

    expect(unwrap(await new ListRecipesUseCase(recipes).execute(playerId))).toEqual([])
    expect(unwrap(await meals.findById(meal.id))?.entryCount).toBe(2)
  })

  it('n’échoue pas sur une recette déjà supprimée', async () => {
    const result = await new DeleteRecipeUseCase(recipes).execute(idFrom('absente'))

    expect(result.ok).toBe(true)
  })
})

describe('Modifier une recette', () => {
  it('la relit par son identifiant, et signale une recette absente', async () => {
    const { recipe } = await pokeBowl()

    expect(unwrap(await new GetRecipeUseCase(recipes).execute(recipe.recipeId)).name).toBe('Poke bowl')
    const missing = await new GetRecipeUseCase(recipes).execute(idFrom('absente'))
    expect(missing.ok ? null : missing.error.code).toBe('RECIPE_NOT_FOUND')
  })

  it('la renomme, et l’enregistre', async () => {
    const { recipe } = await pokeBowl()

    const renamed = unwrap(await new RenameRecipeUseCase(recipes).execute(recipe.recipeId, 'Bowl du soir'))

    expect(renamed.name).toBe('Bowl du soir')
    expect(unwrap(await new ListRecipesUseCase(recipes).execute(playerId)).map((r) => r.name)).toEqual([
      'Bowl du soir',
    ])
  })

  it('refuse le nom d’une autre recette, mais pas de se renommer soi-même', async () => {
    const { meal, recipe } = await pokeBowl()
    unwrap(await save.execute(meal.id, 'Assiette'))
    const rename = new RenameRecipeUseCase(recipes)

    const taken = await rename.execute(recipe.recipeId, 'assiette')
    const sameRecipe = await rename.execute(recipe.recipeId, 'POKE BOWL')

    expect(taken.ok ? null : taken.error.code).toBe('RECIPE_NAME_TAKEN')
    expect(sameRecipe.ok).toBe(true)
  })

  it('change la quantité d’un ingrédient, sans toucher aux repas déjà composés', async () => {
    const { meal, recipe } = await pokeBowl()

    const changed = unwrap(
      await new ChangeRecipeLineQuantityUseCase(recipes).execute(recipe.recipeId, 1, 250),
    )

    expect(changed.lines.map((line) => line.grams)).toEqual([150, 250])
    expect(unwrap(await meals.findById(meal.id))?.entries[1]?.quantity.grams).toBe(100)
  })

  it('refuse une quantité nulle ou un ingrédient inexistant', async () => {
    const { recipe } = await pokeBowl()
    const change = new ChangeRecipeLineQuantityUseCase(recipes)

    const zero = await change.execute(recipe.recipeId, 0, 0)
    const unknown = await change.execute(recipe.recipeId, 9, 100)

    expect(zero.ok).toBe(false)
    expect(unknown.ok ? null : unknown.error.code).toBe('INVALID_RECIPE')
  })

  it('retire un ingrédient, mais pas le dernier', async () => {
    const { recipe } = await pokeBowl()
    const remove = new RemoveRecipeLineUseCase(recipes)

    const one = unwrap(await remove.execute(recipe.recipeId, 0))
    const last = await remove.execute(recipe.recipeId, 0)

    expect(one.lines.map((line) => line.foodName)).toEqual(['Saumon cru'])
    expect(last.ok ? null : last.error.code).toBe('INVALID_RECIPE')
  })
})
