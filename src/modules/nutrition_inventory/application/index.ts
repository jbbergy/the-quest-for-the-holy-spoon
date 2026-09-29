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

export {
  toFoodExport,
  toMealExport,
  toMealSummary,
  toRecipeSummary,
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
  AddFoodToMealUseCase,
  BrowseCustomFoodsUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  FindFoodUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  GetFoodUseCase,
  GetMealUseCase,
  GetRecentPortionsUseCase,
  GetWeekPlanUseCase,
  MarkMealConsumedUseCase,
  PlanMealForMembersUseCase,
  RefreshPlannedMealsUseCase,
  RemoveMealEntryUseCase,
  RescalePlannedMealsUseCase,
  RescheduleMealUseCase,
  UpdateCustomFoodUseCase,
  type AddFoodInput,
  type CustomFoodInput,
  type DailyConsumption,
  type DailyJournal,
  type FoodSearchOptions,
  type FoodSearchResults,
  type InventoryError,
  type InventoryExport,
  type MealGuest,
  type MealSchedule,
  type PlanForMembersInput,
  type PlannedDay,
  type RecentPortion,
  type WeekPlan,
} from './useCases'
