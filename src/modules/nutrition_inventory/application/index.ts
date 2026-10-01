/**
 * Façade publique de `nutrition_inventory`.
 *
 * Seul point d'entrée autorisé pour les autres contextes (règle vérifiée par
 * ESLint et par `architecture.test.ts`). On y expose des **Use Cases** et des
 * **read models** — jamais les entités `Meal`,
 * `MealEntry` ou `FoodItem` construites à la main.
 */
export { MealType, portionScale } from '../domain/Meal'
export { Diet, DietSuitability } from '../domain/DietSuitability'
export { MAX_FAVORITE_PORTIONS_PER_FOOD } from '../domain/FavoritePortion'

export {
  toFavoritePortionSummary,
  toFoodExport,
  toMealExport,
  toMealSummary,
  toRecipeSummary,
  type FavoritePortionSummary,
  type FoodExport,
  type MealEntryExport,
  type MealEntrySummary,
  type MealExport,
  type MealSummary,
  type RecipeLineSummary,
  type RecipeSummary,
} from './readModels'

export { recipesMatching } from './recipeSearch'

export {
  AddFavoritePortionUseCase,
  ListFavoritePortionsUseCase,
  RemoveFavoritePortionUseCase,
  type FavoritePortionInput,
  type FavoritePortionsByFood,
} from './favoritePortionUseCases'

export {
  AddRecipeToMealUseCase,
  ChangeRecipeLineQuantityUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  ListRecipesUseCase,
  RemoveRecipeLineUseCase,
  RenameRecipeUseCase,
  SaveMealAsRecipeUseCase,
  type AddRecipeInput,
  type AddRecipeResult,
} from './recipeUseCases'

export {
  BrowseCustomFoodsUseCase,
  CreateCustomFoodUseCase,
  DeleteFoodUseCase,
  FindFoodUseCase,
  GetFoodUseCase,
  UpdateCustomFoodUseCase,
  type CustomFoodInput,
  type FoodSearchOptions,
  type FoodSearchResults,
} from './foodUseCases'

export {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  DeleteMealUseCase,
  GetMealUseCase,
  GetRecentPortionsUseCase,
  MarkMealConsumedUseCase,
  PlanMealForMembersUseCase,
  RefreshPlannedMealsUseCase,
  RemoveMealEntryUseCase,
  RescalePlannedMealsUseCase,
  RescheduleMealUseCase,
  SaveMealDraftUseCase,
  type AddFoodInput,
  type MealDraftLine,
  type MealGuest,
  type MealReplacement,
  type MealSchedule,
  type PlanForMembersInput,
  type RecentPortion,
  type SaveMealDraftInput,
} from './mealUseCases'

export {
  ExportInventoryUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  GetWeekPlanUseCase,
  type DailyConsumption,
  type DailyJournal,
  type InventoryExport,
  type PlannedDay,
  type WeekPlan,
} from './journalUseCases'

export type { InventoryError } from './shared'
