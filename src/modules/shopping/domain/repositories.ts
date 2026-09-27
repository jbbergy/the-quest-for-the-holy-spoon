import type { RepositoryError } from '@/core/errors'
import type { ShoppingItemId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { ShoppingItem, ShoppingListRef } from './ShoppingItem'

/**
 * Stockage des articles de courses. Comme les autres ports, il ne parle que
 * d'entités : ni clé composée, ni index, ni transaction.
 */
export interface IShoppingItemRepository {
  /** Articles d'une liste : ceux du foyer (ou de la personne) pour cette semaine. */
  findByList(list: ShoppingListRef): Promise<Result<ShoppingItem[], RepositoryError>>
  findById(id: ShoppingItemId): Promise<Result<ShoppingItem | null, RepositoryError>>
  /** Écrit plusieurs articles d'un bloc : tous, ou aucun. */
  saveAll(items: readonly ShoppingItem[]): Promise<Result<void, RepositoryError>>
  /** Supprime plusieurs articles d'un bloc. Un article absent n'est pas une erreur. */
  deleteAll(ids: readonly ShoppingItemId[]): Promise<Result<void, RepositoryError>>
}
