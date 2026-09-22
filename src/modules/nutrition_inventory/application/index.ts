/**
 * Façade publique de `nutrition_inventory`.
 *
 * Seul point d'entrée autorisé pour les autres contextes (règle vérifiée par
 * ESLint et par `architecture.test.ts`). On y expose des **Use Cases**, des
 * **read models** et des **payloads d'événement** — jamais les entités `Meal`,
 * `MealEntry` ou `FoodItem` construites à la main.
 */
export { MealType } from '../domain/Meal'

export {
  MEAL_LOGGED,
  mealLoggedEvent,
  toFoodExport,
  toMealExport,
  toMealSummary,
  type FoodExport,
  type MealEntryExport,
  type MealEntrySummary,
  type MealExport,
  type MealLoggedEvent,
  type MealLoggedPayload,
  type MealSummary,
} from './readModels'

export {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  FindFoodUseCase,
  GetDailyJournalUseCase,
  MarkMealConsumedUseCase,
  RemoveMealEntryUseCase,
  type AddFoodInput,
  type CustomFoodInput,
  type DailyJournal,
  type FoodSearchResults,
  type InventoryError,
  type InventoryExport,
} from './useCases'
