import type { DayKey } from '@/core/day'
import { DomainError } from '@/core/errors'
import {
  type FoodItemId,
  type HouseholdId,
  idFrom,
  newId,
  type PlayerId,
  type ShoppingItemId,
} from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

export class InvalidShoppingItemError extends DomainError {
  constructor(message: string) {
    super('INVALID_SHOPPING_ITEM', message)
  }
}

/**
 * Une liste de courses : celle d'un foyer, ou celle d'une personne seule, pour
 * une semaine donnée (son lundi).
 *
 * `playerId` est toujours renseigné : c'est le titulaire d'une liste
 * personnelle, et la personne qui agit sur une liste de foyer.
 */
export interface ShoppingListRef {
  readonly householdId: HouseholdId | null
  readonly playerId: PlayerId
  readonly week: DayKey
}

/** Clé de la liste : le foyer, sinon la personne. Deux semaines ne se mélangent pas. */
export function listKey(list: ShoppingListRef): string {
  return list.householdId ?? list.playerId
}

/**
 * Unité dans laquelle un article se compte : « g », « ml », « œuf ».
 *
 * Même forme que la mesure d'une ligne de repas, recopiée ici plutôt
 * qu'importée : un contexte ne dépend pas du domaine d'un autre. `grams` est la
 * masse d'une unité — 1 pour le gramme.
 */
export interface ShoppingUnit {
  readonly label: string
  readonly grams: number
  readonly countable: boolean
  readonly approximate: boolean
}

export const GRAM_UNIT: ShoppingUnit = Object.freeze({
  label: 'g',
  grams: 1,
  countable: false,
  approximate: false,
})

export function sameUnit(a: ShoppingUnit, b: ShoppingUnit): boolean {
  return a.label === b.label && a.grams === b.grams && a.countable === b.countable
}

/** Grammes voulus par chaque personne, pour les repas de la semaine. */
export type Contributions = ReadonlyMap<PlayerId, number>

export interface ShoppingItemProps {
  readonly id: ShoppingItemId
  readonly householdId: HouseholdId | null
  readonly playerId: PlayerId
  readonly week: DayKey
  readonly name: string
  /** Aliment des repas dont l'article provient ; `null` pour un article écrit à la main. */
  readonly foodItemId: FoodItemId | null
  readonly unit: ShoppingUnit
  readonly contributions: Contributions
  /**
   * Grammes ajoutés à la main, par la recherche d'aliments. Le remplissage ne
   * les touche pas. Facultatif : les articles d'avant n'en ont pas.
   */
  readonly addedGrams?: number
  /**
   * Quantité en toutes lettres d'un article sans aliment : « 1 paquet »,
   * « x3 ». Facultative, et jamais calculée : on la lit, c'est tout.
   */
  readonly quantityText?: string | null
  readonly checked: boolean
}

const MAX_NAME_LENGTH = 80
const MAX_QUANTITY_TEXT_LENGTH = 30

/**
 * Identifiant d'un article tiré des repas : le même pour tous les membres du
 * foyer. Deux personnes qui remplissent la liste en même temps écrivent donc
 * le même article, au lieu d'en créer deux.
 */
export function mealItemId(list: ShoppingListRef, foodItemId: FoodItemId): ShoppingItemId {
  return idFrom<'ShoppingItemId'>(`${listKey(list)}:${list.week}:${foodItemId}`)
}

/**
 * Un article de la liste de courses.
 *
 * Deux sortes d'articles :
 * - **un aliment** (`foodItemId`) : sa quantité est la somme des parts de
 *   chaque personne, tirées de ses repas, et de ce qu'on a ajouté à la main
 *   par la recherche. Remplir la liste remplace les parts des personnes dont
 *   on a lu les repas, et laisse le reste ;
 * - **un nom seul** (« lessive ») : avec, au besoin, une quantité écrite
 *   librement (« 2 paquets »). Le remplissage ne le touche jamais.
 *
 * Immuable, comme les repas : chaque changement renvoie un nouvel article.
 */
export class ShoppingItem {
  private constructor(
    readonly id: ShoppingItemId,
    readonly householdId: HouseholdId | null,
    readonly playerId: PlayerId,
    readonly week: DayKey,
    readonly name: string,
    readonly foodItemId: FoodItemId | null,
    readonly unit: ShoppingUnit,
    readonly contributions: Contributions,
    readonly checked: boolean,
    readonly addedGrams: number = 0,
    readonly quantityText: string | null = null,
  ) {}

  /** Article écrit à la main, avec sa quantité en toutes lettres s'il y en a une. */
  static manual(
    list: ShoppingListRef,
    name: string,
    quantityText: string | null = null,
  ): Result<ShoppingItem, InvalidShoppingItemError> {
    const cleaned = cleanName(name)
    if (!cleaned.ok) return cleaned
    const quantity = cleanQuantityText(quantityText)
    if (!quantity.ok) return quantity
    return ok(
      new ShoppingItem(
        newId<'ShoppingItemId'>(),
        list.householdId,
        list.playerId,
        list.week,
        cleaned.value,
        null,
        GRAM_UNIT,
        new Map(),
        false,
        0,
        quantity.value,
      ),
    )
  }

  /** Article tiré des repas, encore vide : ses parts arrivent par `withContributions`. */
  static fromMeals(
    list: ShoppingListRef,
    food: { readonly foodItemId: FoodItemId; readonly name: string; readonly unit: ShoppingUnit },
  ): Result<ShoppingItem, InvalidShoppingItemError> {
    const cleaned = cleanName(food.name)
    if (!cleaned.ok) return cleaned
    return ok(
      new ShoppingItem(
        mealItemId(list, food.foodItemId),
        list.householdId,
        list.playerId,
        list.week,
        cleaned.value,
        food.foodItemId,
        food.unit,
        new Map(),
        false,
      ),
    )
  }

  static reconstitute(props: ShoppingItemProps): ShoppingItem {
    return new ShoppingItem(
      props.id,
      props.householdId,
      props.playerId,
      props.week,
      props.name,
      props.foodItemId,
      props.unit,
      new Map(props.contributions),
      props.checked,
      props.addedGrams ?? 0,
      props.quantityText ?? null,
    )
  }

  get isManual(): boolean {
    return this.foodItemId === null
  }

  /** Quantité totale, en grammes : les parts des repas, plus ce qui a été ajouté à la main. */
  get totalGrams(): number {
    let total = this.addedGrams
    for (const grams of this.contributions.values()) total += grams
    return total
  }

  /**
   * Ajoute une quantité à la main, dans l'unité où elle a été choisie. Si
   * l'article compte déjà dans une autre unité, il repasse en grammes, qui
   * conviennent à tout. Un article coché redevient à acheter : il en faut plus.
   */
  addByHand(grams: number, unit: ShoppingUnit): Result<ShoppingItem, InvalidShoppingItemError> {
    if (this.isManual) {
      return err(new InvalidShoppingItemError('Un article sans aliment n’a pas de quantité.'))
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      return err(new InvalidShoppingItemError(`Quantité invalide : ${grams}.`))
    }
    const keepsUnit = this.totalGrams === 0 || sameUnit(this.unit, unit)
    return ok(
      this.with({
        addedGrams: this.addedGrams + grams,
        unit: keepsUnit ? unit : GRAM_UNIT,
        checked: false,
      }),
    )
  }

  /** Quantité dans l'unité de l'article : 6 œufs, 750 g. */
  get amount(): number {
    return this.totalGrams / this.unit.grams
  }

  check(): ShoppingItem {
    return this.checked ? this : this.with({ checked: true })
  }

  uncheck(): ShoppingItem {
    return this.checked ? this.with({ checked: false }) : this
  }

  /**
   * Remplace les parts de certaines personnes.
   *
   * `counted` : les personnes dont on vient de lire les repas. Leur ancienne
   * part disparaît, remplacée par celle de `next` (absente = plus besoin).
   * Les parts des autres ne bougent pas : on ne sait rien de leur semaine.
   *
   * Un article déjà coché redevient à acheter s'il en faut **plus** : ce qui
   * est dans le panier ne suffit plus. S'il en faut moins, il reste coché.
   */
  withContributions(
    counted: ReadonlySet<PlayerId>,
    next: Contributions,
    unit: ShoppingUnit,
  ): ShoppingItem {
    const contributions = new Map<PlayerId, number>()
    for (const [playerId, grams] of this.contributions) {
      if (!counted.has(playerId)) contributions.set(playerId, grams)
    }
    for (const [playerId, grams] of next) {
      if (counted.has(playerId) && grams > 0) contributions.set(playerId, grams)
    }

    const updated = this.with({ contributions, unit })
    const grew = updated.totalGrams > this.totalGrams
    return grew && this.checked ? updated.with({ checked: false }) : updated
  }

  /** Même contenu : ni le nom, ni l'unité, ni les parts, ni la case n'ont changé. */
  sameAs(other: ShoppingItem): boolean {
    if (
      this.name !== other.name ||
      this.checked !== other.checked ||
      this.addedGrams !== other.addedGrams ||
      this.quantityText !== other.quantityText ||
      !sameUnit(this.unit, other.unit) ||
      this.contributions.size !== other.contributions.size
    ) {
      return false
    }
    for (const [playerId, grams] of this.contributions) {
      if (other.contributions.get(playerId) !== grams) return false
    }
    return true
  }

  private with(
    changes: Partial<Pick<ShoppingItemProps, 'unit' | 'contributions' | 'checked' | 'addedGrams'>>,
  ): ShoppingItem {
    return new ShoppingItem(
      this.id,
      this.householdId,
      this.playerId,
      this.week,
      this.name,
      this.foodItemId,
      changes.unit ?? this.unit,
      changes.contributions ?? this.contributions,
      changes.checked ?? this.checked,
      changes.addedGrams ?? this.addedGrams,
      this.quantityText,
    )
  }
}

function cleanName(name: string): Result<string, InvalidShoppingItemError> {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (cleaned === '' || cleaned.length > MAX_NAME_LENGTH) {
    return err(
      new InvalidShoppingItemError(`Un article a un nom de 1 à ${MAX_NAME_LENGTH} caractères.`),
    )
  }
  return ok(cleaned)
}

/** Quantité en toutes lettres : `null` si vide, refusée si trop longue. */
function cleanQuantityText(text: string | null): Result<string | null, InvalidShoppingItemError> {
  const cleaned = (text ?? '').trim().replace(/\s+/g, ' ')
  if (cleaned === '') return ok(null)
  if (cleaned.length > MAX_QUANTITY_TEXT_LENGTH) {
    return err(
      new InvalidShoppingItemError(
        `Une quantité s'écrit en ${MAX_QUANTITY_TEXT_LENGTH} caractères au plus.`,
      ),
    )
  }
  return ok(cleaned)
}
