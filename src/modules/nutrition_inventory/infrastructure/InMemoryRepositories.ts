import { dayKeyOf } from '@/core/day'
import type { RepositoryError } from '@/core/errors'
import type { FoodItemId, MealId, PlayerId } from '@/core/identity'
import { tokenize } from '@/core/infrastructure/text'
import { ok, type Result } from '@/core/result'

import type { FoodItem, FoodSource } from '../domain/FoodItem'
import type { Meal } from '../domain/Meal'
import type { IFoodRepository, IMealRepository } from '../domain/repositories'

/**
 * Adaptateurs en mémoire.
 *
 * Ils servent d'abord aux tests des Use Cases — de vraies implémentations, pas
 * des mocks : on vérifie ainsi l'orchestration contre un stockage qui se
 * comporte vraiment comme un stockage. Leur seconde utilité est une preuve :
 * qu'un second adaptateur satisfasse les mêmes ports que la version IndexedDB,
 * sans rien changer au-dessus, est ce qui rend crédible la promesse de pouvoir
 * changer de base de données.
 */
export class InMemoryFoodRepository implements IFoodRepository {
  private readonly items = new Map<string, FoodItem>()

  async findById(id: FoodItemId): Promise<Result<FoodItem | null, RepositoryError>> {
    return ok(this.items.get(id) ?? null)
  }

  async findByBarcode(barcode: string): Promise<Result<FoodItem | null, RepositoryError>> {
    for (const item of this.items.values()) {
      if (item.barcode === barcode) return ok(item)
    }
    return ok(null)
  }

  /** Même règle que l'adaptateur IndexedDB : tous les mots doivent correspondre. */
  async searchByName(query: string, limit = 25): Promise<Result<FoodItem[], RepositoryError>> {
    const terms = tokenize(query)
    if (terms.length === 0) return ok([])

    const matches = [...this.items.values()]
      .filter((item) => {
        const tokens = tokenize(item.name)
        return terms.every((term) => tokens.some((token) => token.startsWith(term)))
      })
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, limit)

    return ok(matches)
  }

  async findBySource(source: FoodSource): Promise<Result<FoodItem[], RepositoryError>> {
    const found = [...this.items.values()]
      .filter((item) => item.source === source)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return ok(found)
  }

  async save(item: FoodItem): Promise<Result<void, RepositoryError>> {
    this.items.set(item.id, item)
    return ok(undefined)
  }

  async saveMany(items: readonly FoodItem[]): Promise<Result<void, RepositoryError>> {
    for (const item of items) this.items.set(item.id, item)
    return ok(undefined)
  }

  async count(): Promise<Result<number, RepositoryError>> {
    return ok(this.items.size)
  }
}

export class InMemoryMealRepository implements IMealRepository {
  private readonly meals = new Map<string, Meal>()

  async findById(id: MealId): Promise<Result<Meal | null, RepositoryError>> {
    return ok(this.meals.get(id) ?? null)
  }

  async findByPlayerAndDay(
    playerId: PlayerId,
    day: Date,
  ): Promise<Result<Meal[], RepositoryError>> {
    const key = dayKeyOf(day)
    const found = [...this.meals.values()]
      .filter((meal) => meal.playerId === playerId && dayKeyOf(meal.loggedAt) === key)
      .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())

    return ok(found)
  }

  async findAllByPlayer(playerId: PlayerId): Promise<Result<Meal[], RepositoryError>> {
    const found = [...this.meals.values()]
      .filter((meal) => meal.playerId === playerId)
      .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())

    return ok(found)
  }

  async save(meal: Meal): Promise<Result<void, RepositoryError>> {
    this.meals.set(meal.id, meal)
    return ok(undefined)
  }

  async delete(id: MealId): Promise<Result<void, RepositoryError>> {
    this.meals.delete(id)
    return ok(undefined)
  }
}
