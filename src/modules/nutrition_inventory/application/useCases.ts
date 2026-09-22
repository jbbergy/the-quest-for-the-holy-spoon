import { ApplicationError, type DomainError, type RepositoryError } from '@/core/errors'
import { dayKeyOf } from '@/core/day'
import type { EventBus } from '@/core/EventBus'
import type { FoodItemId, MealId, MealEntryId, PlayerId } from '@/core/identity'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { Macros, type MacrosProps } from '@/core/nutrition/Macros'
import { NutrientDetail, type NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import { FoodItem, FoodSource, type FoodTag, isBarcode } from '../domain/FoodItem'
import { Meal, type MealType } from '../domain/Meal'
import { MealEntry } from '../domain/MealEntry'
import type { IRemoteFoodCatalog } from '../domain/providers'
import type { IFoodRepository, IMealRepository } from '../domain/repositories'

import {
  type FoodExport,
  mealLoggedEvent,
  type MealExport,
  type MealSummary,
  toFoodExport,
  toMealExport,
  toMealSummary,
} from './readModels'

export type InventoryError = ApplicationError | DomainError | RepositoryError

// --- Recherche ---------------------------------------------------------------

/** Nombre de fiches demandées au catalogue local, qui n'a aucun quota. */
const DEFAULT_SEARCH_LIMIT = 25

/**
 * Nombre de fiches demandées au catalogue distant.
 *
 * Plus bas que la limite locale, et mesuré plutôt que choisi : l'endpoint de
 * recherche d'Open Food Facts est bridé au coût de la requête, pas seulement à
 * leur nombre. Sur six requêtes identiques alternées, `page_size=25` a été
 * refusé deux fois sur trois par un HTTP 503, là où `page_size=12` est passé à
 * chaque fois. Le refus est correctement dégradé — résultats locaux seuls,
 * bandeau affiché — mais une page plus modeste vaut mieux qu'un repli fréquent.
 */
const REMOTE_SEARCH_LIMIT = 12

export interface FoodSearchResults {
  /** Ce que la saisie a été comprise être — l'UI n'en déduit qu'un libellé. */
  readonly kind: 'by_name' | 'by_barcode'
  /** Catalogue local et distant réunis, triés par nom. */
  readonly items: readonly FoodItem[]
  /**
   * Le distant a-t-il réellement répondu ?
   *
   * `false` couvre aussi bien l'absence de réseau qu'une panne ou un quota
   * dépassé côté Open Food Facts. L'UI doit dire « je n'ai pas pu aller voir »
   * plutôt que laisser une liste courte passer pour une liste complète.
   */
  readonly onlineSearched: boolean
}

/**
 * Recherche unifiée : une saisie, deux sources, une liste.
 *
 * La forme de la saisie choisit le chemin — une suite de 8 à 14 chiffres n'est
 * jamais un nom d'aliment — mais **pas** la source. Les deux chemins
 * interrogent le catalogue local *et* Open Food Facts, puis fusionnent. Le
 * local n'a plus la priorité : servir sa réponse sans appeler le distant
 * masquait les produits de marque derrière le premier générique Ciqual qui
 * portait le même code.
 *
 * Les deux consultations partent **en parallèle** : elles ne dépendent pas
 * l'une de l'autre, et les enchaîner ajouterait la latence du réseau à celle
 * d'IndexedDB sans rien apporter.
 *
 * Une panne distante n'est jamais une erreur de la recherche. Le catalogue
 * local répond seul, `onlineSearched` passe à `false`, et c'est à l'écran de
 * le dire. Seule une panne du **catalogue local** fait échouer l'ensemble :
 * celle-là, rien ne la compense.
 */
export class FindFoodUseCase {
  constructor(
    private readonly foods: IFoodRepository,
    private readonly remote: IRemoteFoodCatalog,
    private readonly network: INetworkStatus,
  ) {}

  async execute(
    text: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<Result<FoodSearchResults, InventoryError>> {
    const trimmed = text.trim()
    const kind = isBarcode(trimmed) ? 'by_barcode' : 'by_name'

    const [local, remote] = await Promise.all([
      this.searchLocally(trimmed, kind, limit),
      this.searchRemotely(trimmed, kind),
    ])

    if (!local.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: local.error,
        }),
      )
    }

    // Le distant ne fait jamais échouer la recherche : il se tait, et on le dit.
    const fresh = remote === null ? [] : this.onlyNew(remote, local.value)
    if (fresh.length > 0) {
      // Les fiches distantes rejoignent le catalogue : elles deviennent
      // disponibles hors connexion, et surtout `AddFoodToMealUseCase` doit
      // pouvoir les relire par leur identifiant au moment de l'ajout.
      const cached = await this.foods.saveMany(fresh)
      if (!cached.ok) {
        return err(
          new ApplicationError('FOOD_NOT_CACHED', 'Les fiches distantes n’ont pas pu être mises en cache.', {
            cause: cached.error,
          }),
        )
      }
    }

    return ok({
      kind,
      items: byName([...local.value, ...fresh]),
      onlineSearched: remote !== null,
    })
  }

  private async searchLocally(
    text: string,
    kind: 'by_name' | 'by_barcode',
    limit: number,
  ): Promise<Result<readonly FoodItem[], RepositoryError>> {
    if (kind === 'by_name') return this.foods.searchByName(text, limit)

    const found = await this.foods.findByBarcode(text)
    if (!found.ok) return found
    return ok(found.value === null ? [] : [found.value])
  }

  /** `null` signifie « le distant n'a pas répondu », à distinguer d'une liste vide. */
  private async searchRemotely(
    text: string,
    kind: 'by_name' | 'by_barcode',
  ): Promise<readonly FoodItem[] | null> {
    if (text.length === 0 || !this.network.isOnline()) return null

    if (kind === 'by_name') {
      const found = await this.remote.searchByName(text, REMOTE_SEARCH_LIMIT)
      return found.ok ? found.value : null
    }

    const found = await this.remote.findByBarcode(text)
    if (!found.ok) return null
    return found.value === null ? [] : [found.value]
  }

  /**
   * Fiches distantes qui ne sont pas déjà en cache local.
   *
   * Le seul doublon à supprimer est la **copie déjà mise en cache d'une fiche
   * Open Food Facts**. L'identifiant ne peut pas la reconnaître : une fiche
   * distante reçoit un identifiant neuf à chaque traduction, si bien que la
   * copie en cache et la version fraîchement récupérée n'en partagent aucun.
   * Le code-barres, lui, désigne le produit.
   *
   * Mais le code-barres seul ne suffit pas comme critère : une fiche Ciqual ou
   * une fiche que vous avez saisie peuvent porter ce même code sans être ce
   * produit. Les confondre masquait le produit de marque derrière votre propre
   * fiche — exactement ce que la priorité au catalogue local faisait avant, par
   * un autre chemin. La source fait donc partie de la clé.
   *
   * Quand la copie locale gagne, c'est délibéré : son identifiant est déjà cité
   * par les repas enregistrés, et la remplacer dupliquerait la fiche au lieu de
   * l'actualiser.
   */
  private onlyNew(
    remote: readonly FoodItem[],
    local: readonly FoodItem[],
  ): FoodItem[] {
    const cached = new Set(
      local
        .filter((item) => item.source === FoodSource.OPEN_FOOD_FACTS)
        .map((item) => item.barcode ?? item.id),
    )
    const fresh: FoodItem[] = []

    for (const item of remote) {
      const key = item.barcode ?? item.id
      if (cached.has(key)) continue
      cached.add(key)
      fresh.push(item)
    }
    return fresh
  }
}

/** Tri alphabétique français : « élevé » se range entre « eau » et « farine ». */
function byName(items: readonly FoodItem[]): readonly FoodItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// --- Aliment personnalisé ----------------------------------------------------

export interface CustomFoodInput {
  readonly name: string
  readonly proteinG: number
  readonly carbsG: number
  readonly fatG: number
  /**
   * Nutriments complémentaires, facultatifs à la saisie.
   *
   * Les exiger transformerait l'ajout d'une recette maison en relevé
   * d'étiquette : mieux vaut un aliment approximatif qu'un aliment jamais
   * enregistré. Ce qui n'est pas renseigné vaut zéro et n'alimente aucune jauge.
   */
  readonly fiberG?: number
  readonly sugarsG?: number
  readonly saturatedFatG?: number
  readonly saltG?: number
  readonly barcode?: string
  readonly tags?: readonly FoodTag[]
}

export class CreateCustomFoodUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(input: CustomFoodInput): Promise<Result<FoodItem, InventoryError>> {
    const macros = Macros.create({
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
    })
    if (!macros.ok) return macros

    const detail = NutrientDetail.create({
      fiberG: input.fiberG ?? 0,
      sugarsG: input.sugarsG ?? 0,
      saturatedFatG: input.saturatedFatG ?? 0,
      saltG: input.saltG ?? 0,
    })
    if (!detail.ok) return detail

    const item = FoodItem.create({
      name: input.name,
      macrosPer100g: macros.value,
      detailPer100g: detail.value,
      source: FoodSource.USER,
      ...(input.barcode === undefined ? {} : { barcode: input.barcode }),
      tags: input.tags ?? [],
    })
    if (!item.ok) return item

    const saved = await this.foods.save(item.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('FOOD_NOT_SAVED', `L’aliment « ${input.name} » n’a pas pu être enregistré.`, {
          cause: saved.error,
        }),
      )
    }

    return ok(item.value)
  }
}

// --- Construction d'un repas -------------------------------------------------

export interface AddFoodInput {
  readonly playerId: PlayerId
  readonly foodItemId: FoodItemId
  readonly grams: number
  readonly mealType: MealType
  /** Repas existant à compléter ; un nouveau repas est créé si absent. */
  readonly mealId?: MealId
  readonly loggedAt?: Date
}

/**
 * Ajoute un aliment à un repas.
 *
 * C'est le Use Case pivot de l'application : il lit la fiche, en fige un
 * instantané dans une `MealEntry`, produit un **nouveau** `Meal`, le sauvegarde,
 * puis publie `MealLoggedEvent`. La publication vient en dernier et ses échecs
 * sont ignorés : si l'attribution d'XP échoue, le repas reste enregistré — le
 * suivi nutritionnel ne doit jamais dépendre du bon fonctionnement du jeu.
 */
export class AddFoodToMealUseCase {
  constructor(
    private readonly foods: IFoodRepository,
    private readonly meals: IMealRepository,
    private readonly events: EventBus,
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

    const entry = MealEntry.fromFoodItem(food.value, quantity.value)
    if (!entry.ok) return entry

    const updated = meal.value.addEntry(entry.value)
    if (!updated.ok) return updated

    const saved = await this.meals.save(updated.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
          cause: saved.error,
        }),
      )
    }

    await this.events.publish(mealLoggedEvent(updated.value))
    return ok(updated.value)
  }

  private async resolveMeal(input: AddFoodInput): Promise<Result<Meal, InventoryError>> {
    if (input.mealId === undefined) {
      return Meal.create({
        playerId: input.playerId,
        type: input.mealType,
        ...(input.loggedAt === undefined ? {} : { loggedAt: input.loggedAt }),
      })
    }

    const found = await this.meals.findById(input.mealId)
    if (!found.ok) {
      return err(
        new ApplicationError('MEAL_UNREADABLE', 'Le repas n’a pas pu être relu.', {
          cause: found.error,
        }),
      )
    }
    if (found.value === null) {
      return err(
        new ApplicationError('MEAL_NOT_FOUND', `Aucun repas ne correspond à ${input.mealId}.`),
      )
    }
    return ok(found.value)
  }
}

export class RemoveMealEntryUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly events: EventBus,
  ) {}

  async execute(mealId: MealId, entryId: MealEntryId): Promise<Result<Meal, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const updated = meal.value.removeEntry(entryId)
    if (!updated.ok) return updated

    const saved = await this.meals.save(updated.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
          cause: saved.error,
        }),
      )
    }

    await this.events.publish(mealLoggedEvent(updated.value))
    return ok(updated.value)
  }
}

export class ChangeMealEntryQuantityUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly events: EventBus,
  ) {}

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

    const saved = await this.meals.save(updated.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
          cause: saved.error,
        }),
      )
    }

    await this.events.publish(mealLoggedEvent(updated.value))
    return ok(updated.value)
  }
}

/**
 * Marque un repas comme pris, ou revient sur ce marquage.
 *
 * Une seule classe pour les deux sens : ils partagent le chargement et
 * l'enregistrement, et ils sont exclusifs — un repas est pris ou ne l'est pas.
 *
 * Aucun événement n'est publié ici. `MEAL_LOGGED` récompense aujourd'hui l'acte
 * d'enregistrer un repas, pas celui de le manger ; republier cet événement
 * attribuerait une seconde fois l'XP du même repas. Déplacer la récompense vers
 * la consommation est une décision de jeu, pas de suivi nutritionnel.
 */
export class MarkMealConsumedUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(mealId: MealId, consumed: boolean): Promise<Result<Meal, InventoryError>> {
    const meal = await loadMeal(this.meals, mealId)
    if (!meal.ok) return meal

    const updated = consumed ? meal.value.markConsumed() : meal.value.markNotConsumed()
    if (!updated.ok) return updated

    const saved = await this.meals.save(updated.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
          cause: saved.error,
        }),
      )
    }

    return ok(updated.value)
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

// --- Journal -----------------------------------------------------------------

export interface DailyJournal {
  readonly day: string
  /** Tous les repas du jour, pris ou simplement prévus. */
  readonly meals: readonly MealSummary[]
  /** Ceux qui ont effectivement été mangés — les seuls qui alimentent les jauges. */
  readonly consumedMeals: readonly MealSummary[]
  /** Calories réellement consommées, donc sur `consumedMeals` seulement. */
  readonly totalCalories: number
  /** Macronutriments réellement consommés, agrégés une fois pour toutes. */
  readonly totalMacros: MacrosProps
  /** Fibres, sucres, AG saturés et sel réellement consommés. */
  readonly totalDetail: NutrientDetailProps
}

/**
 * Journal d'une journée.
 *
 * Retourne des **read models** et non des entités : c'est ce que `planning` et
 * la couche présentation consomment, et cela garantit qu'aucun appelant ne peut
 * contourner les Use Cases pour modifier un repas.
 */
export class GetDailyJournalUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(playerId: PlayerId, day: Date): Promise<Result<DailyJournal, InventoryError>> {
    const found = await this.meals.findByPlayerAndDay(playerId, day)
    if (!found.ok) {
      return err(
        new ApplicationError('JOURNAL_UNREADABLE', 'Le journal n’a pas pu être lu.', {
          cause: found.error,
        }),
      )
    }

    // Le tri « pris / prévu » est fait **ici**, une fois. Le laisser à chaque
    // écran garantirait qu'un écran l'oublie et affiche des apports fictifs.
    const summaries = found.value.map(toMealSummary)
    const consumedMeals = summaries.filter((meal) => meal.consumedAt !== null)

    // Les totaux sont agrégés **ici**, et non dans chaque écran : le tableau de
    // bord et le journal en affichaient déjà deux versions du même calcul, et
    // rien ne garantissait qu'elles filtrent sur le même critère.
    const totalMacros = consumedMeals.reduce(
      (sum, meal) => sum.plus(Macros.reconstitute(meal.macros)),
      Macros.zero(),
    )
    const totalDetail = consumedMeals.reduce(
      (sum, meal) => sum.plus(NutrientDetail.reconstitute(meal.detail)),
      NutrientDetail.zero(),
    )

    return ok({
      day: dayKeyOf(day),
      meals: summaries,
      consumedMeals,
      totalCalories: consumedMeals.reduce((sum, meal) => sum + meal.calories, 0),
      totalMacros: totalMacros.toJSON(),
      totalDetail: totalDetail.toJSON(),
    })
  }
}

// --- Export ------------------------------------------------------------------

export interface InventoryExport {
  /** Tout l'historique du joueur, du plus ancien au plus récent. */
  readonly meals: readonly MealExport[]
  /** Les fiches créées par l'utilisateur, seule partie du catalogue qui lui appartienne. */
  readonly customFoods: readonly FoodExport[]
}

/**
 * Données de `nutrition_inventory` destinées à l'export.
 *
 * Le catalogue Ciqual en est volontairement absent : il est public, versionné
 * dans le dépôt, et un export de 600 Ko de données que l'application sait
 * régénérer seule noierait les quelques kilo-octets qui, eux, n'existent nulle
 * part ailleurs.
 */
export class ExportInventoryUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly foods: IFoodRepository,
  ) {}

  async execute(playerId: PlayerId): Promise<Result<InventoryExport, InventoryError>> {
    const meals = await this.meals.findAllByPlayer(playerId)
    if (!meals.ok) {
      return err(
        new ApplicationError('HISTORY_UNREADABLE', 'L’historique n’a pas pu être lu.', {
          cause: meals.error,
        }),
      )
    }

    const customFoods = await this.foods.findBySource(FoodSource.USER)
    if (!customFoods.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: customFoods.error,
        }),
      )
    }

    return ok({
      meals: meals.value.map(toMealExport),
      customFoods: customFoods.value.map(toFoodExport),
    })
  }
}

async function loadMeal(
  meals: IMealRepository,
  mealId: MealId,
): Promise<Result<Meal, InventoryError>> {
  const found = await meals.findById(mealId)
  if (!found.ok) {
    return err(
      new ApplicationError('MEAL_UNREADABLE', 'Le repas n’a pas pu être relu.', {
        cause: found.error,
      }),
    )
  }
  if (found.value === null) {
    return err(new ApplicationError('MEAL_NOT_FOUND', `Aucun repas ne correspond à ${mealId}.`))
  }
  return ok(found.value)
}
