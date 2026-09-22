/**
 * Façade publique de `planning`.
 */
export { toConsumedTotals, toDailyTarget } from './adapters'
export { SuggestMealCompletionUseCase, type PlanningError } from './useCases'
export {
  CompletionStatus,
  type IdealFoodProfile,
} from '../domain/MealCompletionService'
