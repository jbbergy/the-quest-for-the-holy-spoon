import { ApplicationError, type DomainError, type RepositoryError } from '@/core/errors'
import type { FoodItemId, HouseholdId, PlayerId, ShoppingItemId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import type { IShoppingItemRepository } from '../domain/repositories'
import {
  mealItemId,
  ShoppingItem,
  type ShoppingListRef,
  type ShoppingUnit,
} from '../domain/ShoppingItem'
import { fillShoppingList, type GroceryDemand } from '../domain/ShoppingListFiller'

export type ShoppingError = DomainError | ApplicationError

/** Un article tel que l'écran l'affiche. */
export interface ShoppingItemView {
  readonly id: ShoppingItemId
  readonly name: string
  readonly foodItemId: FoodItemId | null
  /** Quantité dans l'unité de l'article ; 0 pour un article écrit à la main. */
  readonly amount: number
  readonly grams: number
  readonly unit: ShoppingUnit
  /** Quantité en toutes lettres d'un article sans aliment, ou `null`. */
  readonly quantityText: string | null
  readonly checked: boolean
  /** Personnes dont les repas demandent cet article. */
  readonly neededBy: readonly PlayerId[]
}

export interface ShoppingListView {
  readonly householdId: HouseholdId | null
  readonly items: readonly ShoppingItemView[]
}

export interface FillOutcome {
  readonly added: number
  readonly updated: number
}

function toView(item: ShoppingItem): ShoppingItemView {
  return {
    id: item.id,
    name: item.name,
    foodItemId: item.foodItemId,
    amount: item.amount,
    grams: item.totalGrams,
    unit: item.unit,
    quantityText: item.quantityText,
    checked: item.checked,
    neededBy: [...item.contributions.keys()],
  }
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' })

function unreadable(cause: RepositoryError): ApplicationError {
  return new ApplicationError('SHOPPING_LIST_UNREADABLE', 'La liste de courses n’a pas pu être lue.', {
    cause,
  })
}

function unsaved(cause: RepositoryError): ApplicationError {
  return new ApplicationError('SHOPPING_LIST_NOT_SAVED', 'La liste de courses n’a pas pu être enregistrée.', {
    cause,
  })
}

function notFound(): ApplicationError {
  return new ApplicationError('SHOPPING_ITEM_NOT_FOUND', 'Cet article n’est plus dans la liste.')
}

/** La liste d'une semaine, par ordre alphabétique : on la lit en marchant dans les rayons. */
export class GetShoppingListUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(list: ShoppingListRef): Promise<Result<ShoppingListView, ShoppingError>> {
    const found = await this.items.findByList(list)
    if (!found.ok) return err(unreadable(found.error))
    return ok({
      householdId: list.householdId,
      items: found.value.map(toView).sort((a, b) => collator.compare(a.name, b.name)),
    })
  }
}

/**
 * Remplit la liste avec les aliments des repas prévus.
 *
 * `demand` : ce que les repas demandent, pour chaque personne dont on a pu les
 * lire. Seuls les articles qui changent sont écrits — et donc envoyés au
 * foyer : remplir deux fois de suite n'écrit rien la seconde fois.
 */
export class FillShoppingListUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(
    list: ShoppingListRef,
    demand: GroceryDemand,
  ): Promise<Result<FillOutcome, ShoppingError>> {
    const found = await this.items.findByList(list)
    if (!found.ok) return err(unreadable(found.error))

    const plan = fillShoppingList(list, found.value, demand)
    if (!plan.ok) return plan

    const existing = new Set(found.value.map((item) => item.id))
    const saved = await this.items.saveAll(plan.value.save)
    if (!saved.ok) return err(unsaved(saved.error))

    const added = plan.value.save.filter((item) => !existing.has(item.id)).length
    return ok({
      added,
      updated: plan.value.save.length - added,
    })
  }
}

/** Aliment choisi par la recherche, avec sa portion. */
export interface ChosenFood {
  readonly foodItemId: FoodItemId
  readonly name: string
  readonly grams: number
  readonly unit: ShoppingUnit
}

/**
 * Ajoute un aliment trouvé par la recherche, avec sa quantité.
 *
 * Il rejoint la ligne du même aliment s'il y en a déjà une — celle que les
 * repas ont remplie, ou un ajout précédent — plutôt que d'en créer une
 * seconde : on lit la liste au magasin, un aliment n'y figure qu'une fois.
 */
export class AddFoodToShoppingListUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(list: ShoppingListRef, food: ChosenFood): Promise<Result<ShoppingItemView, ShoppingError>> {
    const found = await this.items.findById(mealItemId(list, food.foodItemId))
    if (!found.ok) return err(unreadable(found.error))

    let item = found.value
    if (item === null) {
      const created = ShoppingItem.fromMeals(list, food)
      if (!created.ok) return created
      item = created.value
    }
    const added = item.addByHand(food.grams, food.unit)
    if (!added.ok) return added

    const saved = await this.items.saveAll([added.value])
    return saved.ok ? ok(toView(added.value)) : err(unsaved(saved.error))
  }
}

/** Ajoute un article sans aliment, par son nom et, au besoin, sa quantité : « lessive », « 1 bidon ». */
export class AddShoppingItemUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(
    list: ShoppingListRef,
    name: string,
    quantityText: string | null = null,
  ): Promise<Result<ShoppingItemView, ShoppingError>> {
    const item = ShoppingItem.manual(list, name, quantityText)
    if (!item.ok) return item
    const saved = await this.items.saveAll([item.value])
    return saved.ok ? ok(toView(item.value)) : err(unsaved(saved.error))
  }
}

/** Coche un article mis dans le panier, ou le décoche. */
export class CheckShoppingItemUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(id: ShoppingItemId, checked: boolean): Promise<Result<void, ShoppingError>> {
    const found = await this.items.findById(id)
    if (!found.ok) return err(unreadable(found.error))
    if (found.value === null) return err(notFound())

    const next = checked ? found.value.check() : found.value.uncheck()
    if (next === found.value) return ok(undefined)
    const saved = await this.items.saveAll([next])
    return saved.ok ? ok(undefined) : err(unsaved(saved.error))
  }
}

/**
 * Retire des articles de la liste — le seul chemin qui en retire. Un article
 * tiré des repas reviendra au prochain remplissage si les repas le demandent
 * encore : pour dire « j'en ai déjà », mieux vaut le cocher.
 */
export class RemoveShoppingItemsUseCase {
  constructor(private readonly items: IShoppingItemRepository) {}

  async execute(ids: readonly ShoppingItemId[]): Promise<Result<void, ShoppingError>> {
    const removed = await this.items.deleteAll(ids)
    return removed.ok ? ok(undefined) : err(unsaved(removed.error))
  }
}
