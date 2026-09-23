/**
 * Façade publique de `planning`.
 */
export { toConsumedTotals, toDailyTarget } from './adapters'
export {
  recentWindow,
  SuggestMealCompletionUseCase,
  SummarizeRecentIntakeUseCase,
  type PlanningError,
} from './useCases'
export {
  CompletionStatus,
  type IdealFoodProfile,
} from '../domain/MealCompletionService'
export {
  RECENT_DAYS,
  type DayBalance,
  type Nutrient,
  type NutrientAverage,
  type RecentIntake,
} from '../domain/RecentIntakeService'
