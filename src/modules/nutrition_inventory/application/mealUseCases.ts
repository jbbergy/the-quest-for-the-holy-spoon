/**
 * Use Cases qui composent et modifient un repas : ajouter, corriger, déplacer,
 * cocher, prévoir pour d'autres membres, et les dernières portions saisies.
 */
import { ApplicationError } from '@/core/errors'
import { addDays, type DayKey } from '@/core/day'
import type { FoodItemId, MealId, MealEntryId, PlayerId } from '@/core/identity'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import { FoodItem } from '../domain/FoodItem'
import { Meal, type MealType, portionScale } from '../domain/Meal'
import { MealEntry } from '../domain/MealEntry'
import type { IFoodRepository, IMealOffers, IMealRepository } from '../domain/repositories'

import { type MealSummary, toMealSummary } from './readModels'
import { type InventoryError, loadMeal, saveMeal } from './shared'

// --- Construction d'un repas -------------------------------------------------

export interface AddFoodInput {
  readonly playerId: PlayerId
  readonly foodItemId: FoodItemId
  readonly grams: number
  /**
   * Nom de la mesure de saisie — « tranche », « ml » —, pour réafficher la
   * ligne comme elle a été saisie. Le gramme si absente ou inconnue de la
   * fiche : `grams` fait foi dans tous les cas.
   */
  readonly measure?: string
  readonly mealType: MealType
  /** Repas existant à compléter ; un nouveau repas est créé si absent. */
  readonly mealId?: MealId
  /** Jour d'un **nouveau** repas ; aujourd'hui si absent. Ignoré pour un repas existant. */
  readonly plannedFor?: DayKey
  readonly loggedAt?: Date
}

/**
 * Ajoute un aliment à un repas.
 *
 * C'est le Use Case pivot de l'application : il lit la fiche, en fige un
 * instantané dans une `MealEntry`, produit un **nouveau** `Meal` et le
 * sauvegarde. Un repas n'existe en base qu'à partir de son premier aliment :
 * ouvrir un repas puis renoncer ne laisse aucune coquille vide dans la semaine.
 */
export class AddFoodToMealUseCase {
  constructor(
    private readonly foods: IFoodRepository,
    private readonly meals: IMealRepository,
  ) {}

  async execute(input: AddFoodInput): Promise<Result<Meal, InventoryError>> {
    const quantity = Quantity.create(input.grams)
    if (!quantity.ok) return quantity

    const food = await this.foods.findById(input.foodItemId)
    if (!food.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: food.error,
        }),
      )
    }
    if (food.value === null) {
      return err(
        new ApplicationError(
          'FOOD_NOT_FOUND',
          `Aucun aliment ne correspond à l’identifiant ${input.foodItemId}.`,
        ),
      )
    }

    const meal = await this.resolveMeal(input)
    if (!meal.ok) return meal

    const entry = MealEntry.fromFoodItem(
      food.value,
      quantity.value,
      undefined,
      food.value.measureNamed(input.measure),
    )
    if (!entry.ok) return entry

    const updated = meal.value.addEntry(entry.value)
    if (!updated.ok) return updated

    return saveMeal(this.meals, updated.value)
  }

  private async resolveMeal(input: AddFoodInput): Promise<Result<Meal, InventoryError>> {
    if (input.mealId === undefined) {
      return Meal.create({
        playerId: input.playerId,
        type: input.mealType,
        ...(input.loggedAt === undefined ? {} : { loggedAt: input.loggedAt }),
        ...(input.plannedFor === undefined ? {} : { plannedFor: input.plannedFor }),
      })
    }
    return loadMeal(this.meals, input.mealId)
  }
}

export class RemoveMealEntryUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(mealId: MealId, entryId: MealEntryId): Promise<Result<Meal, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const updated = meal.value.removeEntry(entryId)
    if (!updated.ok) return updated

    return saveMeal(this.meals, updated.value)
  }
}

export class ChangeMealEntryQuantityUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(
    mealId: MealId,
    entryId: MealEntryId,
    grams: number,
  ): Promise<Result<Meal, InventoryError>> {
    const quantity = Quantity.create(grams)
    if (!quantity.ok) return quantity

    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const updated = meal.value.changeEntryQuantity(entryId, quantity.value)
    if (!updated.ok) return updated

    return saveMeal(this.meals, updated.value)
  }
}

export interface MealSchedule {
  readonly type: MealType
  readonly plannedFor: DayKey
}

/**
 * Change le jour et le type d'un repas.
 *
 * Les deux vont ensemble parce que c'est ainsi qu'on réorganise une semaine :
 * « le dîner de mardi devient le déjeuner de mercredi » est un seul geste. Seul
 * le changement de jour est refusé sur un repas pris ; un type, lui, se corrige
 * sans réécrire aucune journée.
 */
export class RescheduleMealUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(mealId: MealId, schedule: MealSchedule): Promise<Result<Meal, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    let updated = meal.value
    if (updated.plannedFor !== schedule.plannedFor) {
      const moved = updated.reschedule(schedule.plannedFor)
      if (!moved.ok) return moved
      updated = moved.value
    }
    if (updated.type !== schedule.type) updated = updated.retype(schedule.type)

    // Rien n'a changé : inutile de réécrire le même repas.
    if (updated === meal.value) return ok(updated)
    return saveMeal(this.meals, updated)
  }
}

/** Une ligne du repas tel qu'on veut l'enregistrer. */
export interface MealDraftLine {
  /** Ligne déjà enregistrée ; absente pour un aliment ajouté dans le brouillon. */
  readonly entryId?: MealEntryId
  readonly foodItemId: FoodItemId
  readonly grams: number
  /** Nom de la mesure de saisie, comme pour `AddFoodInput`. */
  readonly measure?: string
}

export interface SaveMealDraftInput {
  readonly playerId: PlayerId
  /** Repas à mettre à jour ; un nouveau repas est créé si absent. */
  readonly mealId?: MealId
  readonly schedule: MealSchedule
  readonly lines: readonly MealDraftLine[]
}

/**
 * Enregistre en une fois un repas composé à l'écran : jour, type, aliments
 * ajoutés, quantités changées, lignes retirées.
 *
 * Tout est appliqué sur l'agrégat en mémoire, puis le repas est sauvegardé
 * **une seule fois** : un refus en cours de route (aliment disparu, jour
 * interdit pour un repas pris) laisse le repas enregistré tel qu'il était,
 * sans état à moitié écrit. Les ajouts passent avant les retraits, pour qu'un
 * repas ne soit jamais vide, même un instant.
 *
 * Un brouillon identique au repas enregistré n'écrit rien.
 */
export class SaveMealDraftUseCase {
  constructor(
    private readonly foods: IFoodRepository,
    private readonly meals: IMealRepository,
  ) {}

  async execute(input: SaveMealDraftInput): Promise<Result<Meal, InventoryError>> {
    if (input.lines.length === 0) {
      return err(new ApplicationError('EMPTY_MEAL', 'Un repas enregistré a au moins un aliment.'))
    }

    const loaded =
      input.mealId === undefined
        ? Meal.create({
            playerId: input.playerId,
            type: input.schedule.type,
            plannedFor: input.schedule.plannedFor,
          })
        : await loadMeal(this.meals, input.mealId)
    if (!loaded.ok) return loaded

    const original = loaded.value
    let meal = original

    if (input.mealId !== undefined) {
      if (meal.plannedFor !== input.schedule.plannedFor) {
        const moved = meal.reschedule(input.schedule.plannedFor)
        if (!moved.ok) return moved
        meal = moved.value
      }
      if (meal.type !== input.schedule.type) meal = meal.retype(input.schedule.type)
    }

    for (const line of input.lines.filter((candidate) => candidate.entryId === undefined)) {
      const entry = await this.entryFor(line)
      if (!entry.ok) return entry
      const added = meal.addEntry(entry.value)
      if (!added.ok) return added
      meal = added.value
    }

    for (const line of input.lines) {
      if (line.entryId === undefined) continue
      const current = meal.entries.find((entry) => entry.id === line.entryId)
      if (current === undefined) {
        return err(new ApplicationError('MEAL_NOT_FOUND', `La ligne ${line.entryId} n’existe plus.`))
      }
      if (current.quantity.grams === line.grams) continue
      const quantity = Quantity.create(line.grams)
      if (!quantity.ok) return quantity
      const changed = meal.changeEntryQuantity(line.entryId, quantity.value)
      if (!changed.ok) return changed
      meal = changed.value
    }

    const kept = new Set(input.lines.map((line) => line.entryId).filter((id) => id !== undefined))
    for (const entry of original.entries) {
      if (kept.has(entry.id)) continue
      const removed = meal.removeEntry(entry.id)
      if (!removed.ok) return removed
      meal = removed.value
    }

    if (input.mealId !== undefined && meal === original) return ok(meal)
    return saveMeal(this.meals, meal)
  }

  private async entryFor(line: MealDraftLine): Promise<Result<MealEntry, InventoryError>> {
    const quantity = Quantity.create(line.grams)
    if (!quantity.ok) return quantity

    const food = await this.foods.findById(line.foodItemId)
    if (!food.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: food.error,
        }),
      )
    }
    if (food.value === null) {
      return err(
        new ApplicationError('FOOD_NOT_FOUND', `Aucun aliment ne correspond à l’identifiant ${line.foodItemId}.`),
      )
    }
    return MealEntry.fromFoodItem(food.value, quantity.value, undefined, food.value.measureNamed(line.measure))
  }
}

/** Pour un membre, un aliment du repas remplacé par un autre. */
export interface MealReplacement {
  /** La ligne du repas qu'on remplace. */
  readonly entryId: MealEntryId
  readonly foodItemId: FoodItemId
  /** Quantité choisie pour ce membre : elle n'est pas ajustée à ses besoins. */
  readonly grams: number
  /** Nom de la mesure de saisie, comme pour `AddFoodInput`. */
  readonly measure?: string
}

/** Membre du foyer pour qui l'on prévoit aussi un repas. */
export interface MealGuest {
  readonly playerId: PlayerId
  /** Besoin calorique habituel du membre, s'il l'a publié. */
  readonly targetCalories: number | null
  /** Aliments changés pour lui seul : des merguez végétales au lieu des merguez. */
  readonly replacements?: readonly MealReplacement[]
}

export interface PlanForMembersInput {
  readonly mealId: MealId
  /** Profil qui prévoit : il signe les copies. */
  readonly plannedBy: PlayerId
  /** Son propre besoin calorique, pour mettre les portions à l'échelle. */
  readonly ownCalories: number | null
  readonly guests: readonly MealGuest[]
  readonly at?: Date
}

/**
 * Prévoit un repas pour d'autres membres du foyer.
 *
 * Chaque membre reçoit sa propre copie, non prise, aux portions ajustées au
 * rapport de ses besoins à ceux de l'auteur. La copie ne reste pas sur
 * l'appareil : elle part au serveur, qui la range dans la semaine du membre.
 * Tout ou rien côté domaine — une copie impossible (repas vide, aliment de
 * remplacement introuvable) n'en envoie aucune —, puis une copie par membre à
 * l'envoi.
 */
export class PlanMealForMembersUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly offers: IMealOffers,
    private readonly foods: IFoodRepository,
  ) {}

  async execute(input: PlanForMembersInput): Promise<Result<readonly Meal[], InventoryError>> {
    const meal = await loadMeal(this.meals, input.mealId)
    if (!meal.ok) return meal

    const at = input.at ?? new Date()
    const copies: Meal[] = []
    for (const guest of input.guests) {
      const replacements = await this.replacementsFor(guest)
      if (!replacements.ok) return replacements
      const copy = meal.value.planFor({
        playerId: guest.playerId,
        plannedBy: input.plannedBy,
        scale: portionScale(input.ownCalories, guest.targetCalories),
        at,
        replacements: replacements.value,
      })
      if (!copy.ok) return copy
      copies.push(copy.value)
    }

    for (const copy of copies) {
      const sent = await this.offers.offer(copy)
      if (!sent.ok) {
        return err(
          new ApplicationError(sent.error.code, 'Le repas n’a pas pu être prévu pour le foyer.', {
            cause: sent.error,
          }),
        )
      }
    }
    return ok(copies)
  }

  /** Les lignes de remplacement d'un membre, chacune tirée de la fiche du jour. */
  private async replacementsFor(
    guest: MealGuest,
  ): Promise<Result<ReadonlyMap<MealEntryId, MealEntry>, InventoryError>> {
    const lines = new Map<MealEntryId, MealEntry>()
    for (const replacement of guest.replacements ?? []) {
      const quantity = Quantity.create(replacement.grams)
      if (!quantity.ok) return quantity

      const food = await this.foods.findById(replacement.foodItemId)
      if (!food.ok) {
        return err(
          new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
            cause: food.error,
          }),
        )
      }
      if (food.value === null) {
        return err(
          new ApplicationError(
            'FOOD_NOT_FOUND',
            `Aucun aliment ne correspond à l’identifiant ${replacement.foodItemId}.`,
          ),
        )
      }

      const entry = MealEntry.fromFoodItem(
        food.value,
        quantity.value,
        undefined,
        food.value.measureNamed(replacement.measure),
      )
      if (!entry.ok) return entry
      lines.set(replacement.entryId, entry.value)
    }
    return ok(lines)
  }
}

/**
 * Marque un repas comme pris, ou revient sur ce marquage.
 *
 * Une seule classe pour les deux sens : ils partagent le chargement et
 * l'enregistrement, et ils sont exclusifs — un repas est pris ou ne l'est pas.
 */
export class MarkMealConsumedUseCase {
  constructor(private readonly meals: IMealRepository) {}

  /** `at` : moment du repas, maintenant par défaut — on coche en général en sortant de table. */
  async execute(
    mealId: MealId,
    consumed: boolean,
    at: Date = new Date(),
  ): Promise<Result<Meal, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const updated = consumed ? meal.value.markConsumed(at) : meal.value.markNotConsumed()
    if (!updated.ok) return updated

    return saveMeal(this.meals, updated.value)
  }
}

export class DeleteMealUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(mealId: MealId): Promise<Result<void, InventoryError>> {
    const deleted = await this.meals.delete(mealId)
    if (!deleted.ok) {
      return err(
        new ApplicationError('MEAL_NOT_DELETED', 'Le repas n’a pas pu être supprimé.', {
          cause: deleted.error,
        }),
      )
    }
    return ok(undefined)
  }
}

/**
 * Remet les repas **prévus** d'une période à jour des fiches actuelles.
 *
 * Une fiche change par plusieurs chemins — nouvelle édition de Ciqual, produit
 * Open Food Facts relu, aliment d'un membre du foyer reçu par synchronisation.
 * Plutôt que de guetter chacun, les écrans appellent ce Use Case avant de lire
 * leurs repas : ce qu'ils affichent d'un repas non pris est alors toujours
 * calculé sur la fiche du moment. Les repas pris ne sont pas touchés.
 *
 * Renvoie le nombre de repas réécrits. Seuls ceux-là sont enregistrés — et donc
 * envoyés au serveur : relire une semaine inchangée n'écrit rien.
 */
export class RefreshPlannedMealsUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly foods: IFoodRepository,
  ) {}

  async execute(
    playerId: PlayerId,
    from: DayKey,
    to: DayKey,
  ): Promise<Result<number, InventoryError>> {
    const found = await this.meals.findByPlayerBetween(playerId, from, to)
    if (!found.ok) {
      return err(
        new ApplicationError('MEALS_UNREADABLE', 'Les repas prévus n’ont pas pu être relus.', {
          cause: found.error,
        }),
      )
    }

    const planned = found.value.filter((meal) => !meal.isConsumed && !meal.isEmpty)
    if (planned.length === 0) return ok(0)

    const catalog = await this.catalogFor(planned)
    if (!catalog.ok) return catalog

    let rewritten = 0
    for (const meal of planned) {
      const refreshed = meal.refreshFrom(catalog.value)
      if (!refreshed.ok) return refreshed
      if (refreshed.value === meal) continue

      const saved = await saveMeal(this.meals, refreshed.value)
      if (!saved.ok) return saved
      rewritten += 1
    }
    return ok(rewritten)
  }

  /** Les fiches des aliments de ces repas, chacune lue une seule fois. */
  private async catalogFor(
    meals: readonly Meal[],
  ): Promise<Result<Map<FoodItemId, FoodItem>, InventoryError>> {
    const ids = new Set(meals.flatMap((meal) => meal.entries.map((entry) => entry.foodItemId)))
    const catalog = new Map<FoodItemId, FoodItem>()
    for (const id of ids) {
      const food = await this.foods.findById(id)
      if (!food.ok) {
        return err(
          new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
            cause: food.error,
          }),
        )
      }
      if (food.value !== null) catalog.set(id, food.value)
    }
    return ok(catalog)
  }
}

/**
 * Jusqu'où regarder devant soi : personne ne prévoit ses repas à plus d'un an.
 * Au-delà, un repas prévu garde ses portions.
 */
const PLANNING_HORIZON_DAYS = 366

/**
 * Ajuste les portions des repas **prévus** à partir de `from`, quand les
 * besoins de la personne changent — une pesée, une activité plus soutenue.
 *
 * Les repas pris ne bougent pas : ce qui a été mangé a été mangé. Les repas
 * restés « prévus » des jours passés non plus : ce sont des oublis de cocher,
 * pas des projets. Renvoie le nombre de repas réécrits.
 */
export class RescalePlannedMealsUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(
    playerId: PlayerId,
    from: DayKey,
    scale: number,
  ): Promise<Result<number, InventoryError>> {
    if (scale === 1) return ok(0)

    const found = await this.meals.findByPlayerBetween(
      playerId,
      from,
      addDays(from, PLANNING_HORIZON_DAYS),
    )
    if (!found.ok) {
      return err(
        new ApplicationError('MEALS_UNREADABLE', 'Les repas prévus n’ont pas pu être relus.', {
          cause: found.error,
        }),
      )
    }

    let rewritten = 0
    for (const meal of found.value) {
      if (meal.isConsumed || meal.isEmpty) continue
      const rescaled = meal.rescale(scale)
      if (!rescaled.ok) return rescaled
      if (rescaled.value === meal) continue

      const saved = await saveMeal(this.meals, rescaled.value)
      if (!saved.ok) return saved
      rewritten += 1
    }
    return ok(rewritten)
  }
}

/** Un repas, pour l'écran qui le compose. */
export class GetMealUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(mealId: MealId): Promise<Result<MealSummary, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    return meal.ok ? ok(toMealSummary(meal.value)) : meal
  }
}

// --- Dernières portions -----------------------------------------------------

/** Jours relus en arrière pour retrouver la dernière portion d'un aliment. */
const RECENT_PORTION_DAYS = 90
/** …et en avant : un repas prévu pour la semaine dit aussi « ma portion habituelle ». */
const PLANNED_PORTION_DAYS = 14

/** La dernière quantité saisie pour un aliment, et la mesure dans laquelle elle l'a été. */
export interface RecentPortion {
  readonly grams: number
  readonly measure: string
}

/**
 * Dernière portion saisie pour chaque aliment.
 *
 * C'est la suggestion la plus juste qui soit : ni une moyenne nationale ni
 * l'emballage, mais ce que *cette* personne met dans *son* assiette. Le plus
 * récemment composé l'emporte, qu'il ait été pris ou seulement prévu. Une seule
 * lecture pour tous les aliments : l'éditeur la fait à l'ouverture, puis chaque
 * sélection d'un aliment n'est plus qu'une consultation.
 */
export class GetRecentPortionsUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(
    playerId: PlayerId,
    around: DayKey,
  ): Promise<Result<ReadonlyMap<FoodItemId, RecentPortion>, InventoryError>> {
    const found = await this.meals.findByPlayerBetween(
      playerId,
      addDays(around, -RECENT_PORTION_DAYS),
      addDays(around, PLANNED_PORTION_DAYS),
    )
    if (!found.ok) {
      return err(
        new ApplicationError('HISTORY_UNREADABLE', 'L’historique des repas n’a pas pu être lu.', {
          cause: found.error,
        }),
      )
    }

    const portions = new Map<FoodItemId, RecentPortion>()
    const byComposition = [...found.value].sort(
      (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime(),
    )
    for (const meal of byComposition) {
      for (const entry of meal.entries) {
        portions.set(entry.foodItemId, {
          grams: entry.quantity.grams,
          measure: entry.measure.label,
        })
      }
    }
    return ok(portions)
  }
}
