/**
 * Façade publique de `nutrition_inventory`.
 *
 * Seul point d'entrée autorisé pour les autres contextes (règle vérifiée par
 * ESLint et par `architecture.test.ts`). On y expose des **Use Cases** et des
 * **read models** — jamais les entités `Meal`,
 * `MealEntry` ou `FoodItem` construites à la main.
 */
export { MealType } from '../domain/Meal'

export {
  toFoodExport,
  toMealExport,
  toMealSummary,
  type FoodExport,
  type MealEntryExport,
  type MealEntrySummary,
  type MealExport,
  type MealSummary,
} from './readModels'

export {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  FindFoodUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  GetMealUseCase,
  GetWeekPlanUseCase,
  MarkMealConsumedUseCase,
  RemoveMealEntryUseCase,
  RescheduleMealUseCase,
  type AddFoodInput,
  type CustomFoodInput,
  type DailyConsumption,
  type DailyJournal,
  type FoodSearchResults,
  type InventoryError,
  type InventoryExport,
  type MealSchedule,
  type PlannedDay,
  type WeekPlan,
} from './useCases'
