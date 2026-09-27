import type { RepositoryError } from '@/core/errors'
import type { ShoppingItemId } from '@/core/identity'
import { ok, type Result } from '@/core/result'

import type { IShoppingItemRepository } from '../domain/repositories'
import { listKey, type ShoppingItem, type ShoppingListRef } from '../domain/ShoppingItem'

/** Adaptateur en mémoire : pour les tests des Use Cases, avec les mêmes règles que IndexedDB. */
export class InMemoryShoppingRepository implements IShoppingItemRepository {
  private readonly items = new Map<string, ShoppingItem>()

  async findByList(list: ShoppingListRef): Promise<Result<ShoppingItem[], RepositoryError>> {
    const key = listKey(list)
    return ok([...this.items.values()].filter((item) => listKey(item) === key && item.week === list.week))
  }

  async findById(id: ShoppingItemId): Promise<Result<ShoppingItem | null, RepositoryError>> {
    return ok(this.items.get(id) ?? null)
  }

  async saveAll(items: readonly ShoppingItem[]): Promise<Result<void, RepositoryError>> {
    for (const item of items) this.items.set(item.id, item)
    return ok(undefined)
  }

  async deleteAll(ids: readonly ShoppingItemId[]): Promise<Result<void, RepositoryError>> {
    for (const id of ids) this.items.delete(id)
    return ok(undefined)
  }
}
