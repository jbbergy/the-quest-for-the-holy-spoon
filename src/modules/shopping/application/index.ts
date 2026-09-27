/**
 * Façade publique de `shopping`.
 *
 * Seul point d'entrée autorisé pour les autres contextes : des Use Cases et
 * des vues, jamais l'entité `ShoppingItem` elle-même.
 */
export type { ShoppingListRef, ShoppingUnit } from '../domain/ShoppingItem'
export type { GroceryDemand, GroceryLine } from '../domain/ShoppingListFiller'

export {
  AddFoodToShoppingListUseCase,
  AddShoppingItemUseCase,
  CheckShoppingItemUseCase,
  FillShoppingListUseCase,
  GetShoppingListUseCase,
  RemoveShoppingItemsUseCase,
  type ChosenFood,
  type FillOutcome,
  type ShoppingError,
  type ShoppingItemView,
  type ShoppingListView,
} from './useCases'
