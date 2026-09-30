import { ApplicationError, type DomainError, type RepositoryError } from '@/core/errors'
import { addDays, type DayKey, dayKeyOf, weekOf } from '@/core/day'
import type { FoodItemId, MealId, MealEntryId, PlayerId } from '@/core/identity'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { Macros, type MacrosProps } from '@/core/nutrition/Macros'
import { NutrientDetail, type NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import { type Diet, DietSuitability } from '../domain/DietSuitability'
import { FoodItem, FoodSource, type FoodTag, isBarcode } from '../domain/FoodItem'
import { Meal, type MealType, portionScale } from '../domain/Meal'
import { MealEntry } from '../domain/MealEntry'
import { BaseUnit } from '../domain/Measure'
import type { IRemoteFoodCatalog } from '../domain/providers'
import type { IFoodRepository, IMealOffers, IMealRepository } from '../domain/repositories'

import {
  type FoodExport,
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
  /**
   * Résultats écartés parce qu'ils ne conviennent pas aux régimes demandés.
   * Rendus plutôt que jetés : l'écran dit combien il en masque, et peut les
   * montrer quand même — un marqueur déduit d'un nom peut se tromper.
   */
  readonly excluded: readonly FoodItem[]
}

export interface FoodSearchOptions {
  readonly limit?: number
  /** Régimes à respecter ; aucun par défaut. */
  readonly diets?: readonly Diet[]
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
    options: FoodSearchOptions = {},
  ): Promise<Result<FoodSearchResults, InventoryError>> {
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT
    const diets = options.diets ?? []
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
    const { fresh, refreshed } =
      remote === null ? { fresh: [], refreshed: [] } : this.reconcile(remote, local.value)
    const toCache = [...fresh, ...refreshed]
    if (toCache.length > 0) {
      // Les fiches distantes rejoignent le catalogue : elles deviennent
      // disponibles hors connexion, et surtout `AddFoodToMealUseCase` doit
      // pouvoir les relire par leur identifiant au moment de l'ajout.
      const cached = await this.foods.saveMany(toCache)
      if (!cached.ok) {
        return err(
          new ApplicationError('FOOD_NOT_CACHED', 'Les fiches distantes n’ont pas pu être mises en cache.', {
            cause: cached.error,
          }),
        )
      }
    }

    const current = new Map(refreshed.map((item) => [item.id, item]))
    const found = byName([...local.value.map((item) => current.get(item.id) ?? item), ...fresh])
    return ok({
      kind,
      items: found.filter((item) => DietSuitability.suits(item, diets)),
      onlineSearched: remote !== null,
      excluded: found.filter((item) => !DietSuitability.suits(item, diets)),
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
   * Fiches distantes qui ne sont pas déjà en cache local, et copies en cache
   * que la version en ligne a fait évoluer.
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
   * l'actualiser. Elle reprend en revanche **tout le contenu** de la version
   * fraîche — nom, valeurs, marqueurs, portions : Open Food Facts est
   * contributif, un produit s'y corrige, et c'est ici seulement que la copie
   * peut l'apprendre. Les repas prévus suivront à leur prochain affichage
   * (`RefreshPlannedMealsUseCase`) ; les repas pris gardent leur instantané.
   */
  private reconcile(
    remote: readonly FoodItem[],
    local: readonly FoodItem[],
  ): { readonly fresh: FoodItem[]; readonly refreshed: FoodItem[] } {
    const cached = new Map(
      local
        .filter((item) => item.source === FoodSource.OPEN_FOOD_FACTS)
        .map((item) => [item.barcode ?? item.id, item] as const),
    )
    const seen = new Set(cached.keys())
    const fresh: FoodItem[] = []
    const refreshed: FoodItem[] = []

    for (const item of remote) {
      const key = item.barcode ?? item.id
      const copy = cached.get(key)
      if (copy !== undefined) {
        cached.delete(key)
        if (!sameContent(copy, item)) refreshed.push(refreshedCopy(copy, item))
        continue
      }
      if (seen.has(key)) continue
      seen.add(key)
      fresh.push(item)
    }
    return { fresh, refreshed }
  }
}

/** La copie en cache, au contenu de la version fraîche, sous son identifiant d'origine. */
function refreshedCopy(copy: FoodItem, fresh: FoodItem): FoodItem {
  const barcode = copy.barcode ?? fresh.barcode
  return FoodItem.reconstitute({
    id: copy.id,
    name: fresh.name,
    macrosPer100g: fresh.macrosPer100g,
    detailPer100g: fresh.detailPer100g,
    source: copy.source,
    ...(barcode === undefined ? {} : { barcode }),
    tags: fresh.tags,
    ownerId: copy.ownerId,
    ...fresh.portions,
  })
}

function sameContent(a: FoodItem, b: FoodItem): boolean {
  const same = (x: object, y: object) => JSON.stringify(x) === JSON.stringify(y)
  return (
    a.name === b.name &&
    same(a.macrosPer100g.toJSON(), b.macrosPer100g.toJSON()) &&
    same(a.detailPer100g.toJSON(), b.detailPer100g.toJSON()) &&
    same([...a.tags].sort(), [...b.tags].sort()) &&
    a.unit === b.unit &&
    a.density === b.density &&
    a.servings.length === b.servings.length &&
    a.servings.every(
      (serving, index) =>
        serving.label === b.servings[index]?.label && serving.grams === b.servings[index]?.grams,
    )
  )
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
  /**
   * Profil qui crée l'aliment. Sans lui, l'aliment reste sur l'appareil : il
   * ne peut pas être partagé avec le foyer, faute d'auteur à qui le rattacher.
   */
  readonly ownerId?: PlayerId | null
  /**
   * `ml` pour un liquide, dont les valeurs sont alors saisies pour 100 ml —
   * comme sur l'étiquette d'une boisson. Le gramme par défaut.
   */
  readonly unit?: BaseUnit
  /** Portions propres à l'aliment : « part » = 120 g, « verre » = 200 ml. */
  readonly servings?: readonly { readonly label: string; readonly grams: number }[]
}

export class CreateCustomFoodUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(input: CustomFoodInput): Promise<Result<FoodItem, InventoryError>> {
    const item = customFoodFrom(input)
    if (!item.ok) return item

    return saveFood(this.foods, item.value)
  }
}

/**
 * Corrige un aliment créé à la main.
 *
 * La fiche garde son identifiant — c'est lui que citent les repas — et son
 * auteur. Les repas **prévus** qui l'utilisent suivront la correction à leur
 * prochain affichage (`RefreshPlannedMealsUseCase`) ; les repas pris gardent
 * l'instantané de ce qui a été mangé.
 */
export class UpdateCustomFoodUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(
    id: FoodItemId,
    input: CustomFoodInput,
    editor: PlayerId | null,
  ): Promise<Result<FoodItem, InventoryError>> {
    const current = await findFood(this.foods, id)
    if (!current.ok) return current
    if (!current.value.isEditableBy(editor)) return err(readOnly(current.value))

    const item = customFoodFrom({ ...input, ownerId: current.value.ownerId }, id)
    if (!item.ok) return item

    return saveFood(this.foods, item.value)
  }
}

/**
 * Supprime un aliment créé à la main, par son auteur.
 *
 * Les repas n'en souffrent pas : chaque ligne garde l'instantané de l'aliment,
 * et un repas prévu dont la fiche a disparu conserve simplement ses chiffres.
 */
export class DeleteFoodUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(id: FoodItemId, editor: PlayerId | null): Promise<Result<void, InventoryError>> {
    const current = await findFood(this.foods, id)
    if (!current.ok) return current
    if (!current.value.isEditableBy(editor)) return err(readOnly(current.value))

    const deleted = await this.foods.delete(id)
    if (!deleted.ok) {
      return err(
        new ApplicationError('FOOD_NOT_DELETED', 'L’aliment n’a pas pu être supprimé.', {
          cause: deleted.error,
        }),
      )
    }
    return ok(undefined)
  }
}

/** Une fiche du catalogue local, pour l'afficher ou la modifier. */
export class GetFoodUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(id: FoodItemId): Promise<Result<FoodItem, InventoryError>> {
    return findFood(this.foods, id)
  }
}

/** Au-delà, une liste n'aide plus à retrouver un aliment : on affine la recherche. */
const BROWSE_LIMIT = 100

/**
 * Les aliments créés à la main que l'appareil détient : les siens, et ceux
 * des autres membres du foyer reçus par synchronisation.
 *
 * Ciqual et Open Food Facts n'y figurent pas : ce sont des références, que
 * l'on consulte en composant un repas mais qu'on ne gère pas.
 */
export class BrowseCustomFoodsUseCase {
  constructor(private readonly foods: IFoodRepository) {}

  async execute(query = ''): Promise<Result<readonly FoodItem[], InventoryError>> {
    const trimmed = query.trim()
    const found =
      trimmed === ''
        ? await this.foods.findBySource(FoodSource.USER)
        : await this.foods.searchByName(trimmed, 1000)

    if (!found.ok) {
      return err(
        new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
          cause: found.error,
        }),
      )
    }
    return ok(
      byName(found.value.filter((item) => item.source === FoodSource.USER)).slice(0, BROWSE_LIMIT),
    )
  }
}

function customFoodFrom(
  input: CustomFoodInput,
  id?: FoodItemId,
): Result<FoodItem, InventoryError> {
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

  return FoodItem.create({
    ...(id === undefined ? {} : { id }),
    name: input.name,
    macrosPer100g: macros.value,
    detailPer100g: detail.value,
    source: FoodSource.USER,
    ...(input.barcode === undefined ? {} : { barcode: input.barcode }),
    tags: input.tags ?? [],
    ownerId: input.ownerId ?? null,
    // Valeurs saisies pour 100 ml : le millilitre est le référentiel de la
    // fiche, sa densité vaut donc 1, comme pour une boisson d'Open Food Facts.
    unit: input.unit ?? BaseUnit.GRAM,
    density: 1,
    servings: (input.servings ?? []).map((serving) => ({ ...serving, approximate: false })),
  })
}

async function findFood(
  foods: IFoodRepository,
  id: FoodItemId,
): Promise<Result<FoodItem, InventoryError>> {
  const found = await foods.findById(id)
  if (!found.ok) {
    return err(
      new ApplicationError('CATALOG_UNREADABLE', 'Le catalogue local est illisible.', {
        cause: found.error,
      }),
    )
  }
  if (found.value === null) {
    return err(new ApplicationError('FOOD_NOT_FOUND', `Aucun aliment ne correspond à ${id}.`))
  }
  return ok(found.value)
}

async function saveFood(
  foods: IFoodRepository,
  item: FoodItem,
): Promise<Result<FoodItem, InventoryError>> {
  const saved = await foods.save(item)
  if (!saved.ok) {
    return err(
      new ApplicationError('FOOD_NOT_SAVED', `L’aliment « ${item.name} » n’a pas pu être enregistré.`, {
        cause: saved.error,
      }),
    )
  }
  return ok(item)
}

/** Refus d'une modification : fiche de référence, ou aliment d'un autre membre. */
function readOnly(food: FoodItem): ApplicationError {
  return food.source === FoodSource.USER
    ? new ApplicationError('NOT_OWNER', `L’aliment ${food.id} appartient à un autre membre.`)
    : new ApplicationError('FOOD_READ_ONLY', `La fiche ${food.id} (${food.source}) ne se modifie pas.`)
}

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

/** Membre du foyer pour qui l'on prévoit aussi un repas. */
export interface MealGuest {
  readonly playerId: PlayerId
  /** Besoin calorique habituel du membre, s'il l'a publié. */
  readonly targetCalories: number | null
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
 * Tout ou rien côté domaine — une copie impossible (repas vide) n'en envoie
 * aucune —, puis une copie par membre à l'envoi.
 */
export class PlanMealForMembersUseCase {
  constructor(
    private readonly meals: IMealRepository,
    private readonly offers: IMealOffers,
  ) {}

  async execute(input: PlanForMembersInput): Promise<Result<readonly Meal[], InventoryError>> {
    const meal = await loadMeal(this.meals, input.mealId)
    if (!meal.ok) return meal

    const at = input.at ?? new Date()
    const copies: Meal[] = []
    for (const guest of input.guests) {
      const copy = meal.value.planFor({
        playerId: guest.playerId,
        plannedBy: input.plannedBy,
        scale: portionScale(input.ownCalories, guest.targetCalories),
        at,
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

    const totals = totalsOf(consumedMeals)

    return ok({
      day: dayKeyOf(day),
      meals: summaries,
      consumedMeals,
      totalCalories: totals.calories,
      totalMacros: totals.macros,
      totalDetail: totals.detail,
    })
  }
}

interface ConsumedTotals {
  readonly calories: number
  readonly macros: MacrosProps
  readonly detail: NutrientDetailProps
}

/**
 * Somme des repas pris.
 *
 * Agrégée **ici**, et non dans chaque écran : le journal du jour et
 * l'historique doivent compter exactement de la même façon, sans quoi la
 * moyenne de la semaine ne correspondrait pas aux jauges des jours passés.
 */
function totalsOf(consumedMeals: readonly MealSummary[]): ConsumedTotals {
  const macros = consumedMeals.reduce(
    (sum, meal) => sum.plus(Macros.reconstitute(meal.macros)),
    Macros.zero(),
  )
  const detail = consumedMeals.reduce(
    (sum, meal) => sum.plus(NutrientDetail.reconstitute(meal.detail)),
    NutrientDetail.zero(),
  )
  return {
    calories: consumedMeals.reduce((sum, meal) => sum + meal.calories, 0),
    macros: macros.toJSON(),
    detail: detail.toJSON(),
  }
}

// --- Historique --------------------------------------------------------------

/** Ce qui a été effectivement pris un jour donné. */
export interface DailyConsumption extends ConsumedTotals {
  readonly day: DayKey
  readonly consumedMealCount: number
}

/**
 * Apports réels, jour par jour, sur une période.
 *
 * Seuls figurent les jours où **au moins un repas a été pris**. Un jour absent
 * n'est pas un jour à zéro calorie : c'est un jour dont on ne sait rien, et
 * c'est à l'appelant d'en décider — pas à ce Use Case de le travestir en jeûne.
 */
export class GetConsumptionHistoryUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(
    playerId: PlayerId,
    from: DayKey,
    to: DayKey,
  ): Promise<Result<readonly DailyConsumption[], InventoryError>> {
    const found = await this.meals.findByPlayerBetween(playerId, from, to)
    if (!found.ok) {
      return err(
        new ApplicationError('HISTORY_UNREADABLE', 'L’historique des repas n’a pas pu être lu.', {
          cause: found.error,
        }),
      )
    }

    const consumedByDay = new Map<DayKey, MealSummary[]>()
    for (const meal of found.value) {
      if (!meal.isConsumed) continue
      const sameDay = consumedByDay.get(meal.plannedFor) ?? []
      consumedByDay.set(meal.plannedFor, [...sameDay, toMealSummary(meal)])
    }

    return ok(
      [...consumedByDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, meals]) => ({ day, consumedMealCount: meals.length, ...totalsOf(meals) })),
    )
  }
}

// --- Semaine -----------------------------------------------------------------

export interface PlannedDay {
  readonly day: DayKey
  /** Repas du jour, pris ou prévus, dans l'ordre où ils ont été composés. */
  readonly meals: readonly MealSummary[]
  /**
   * Calories de **tous** les repas du jour, pris ou non.
   *
   * L'inverse du tableau de bord, et volontairement : planifier, c'est regarder
   * ce qu'une journée représentera une fois vécue. N'y compter que les repas
   * pris afficherait zéro sur tous les jours à venir.
   */
  readonly plannedCalories: number
}

export interface WeekPlan {
  /** Les sept jours, du lundi au dimanche, y compris ceux sans aucun repas. */
  readonly days: readonly PlannedDay[]
}

/**
 * Semaine de repas contenant un jour donné.
 *
 * Les jours vides figurent dans le résultat : c'est sur eux que la
 * planification se fait, et les laisser à la présentation obligerait chaque
 * écran à recalculer le calendrier.
 */
export class GetWeekPlanUseCase {
  constructor(private readonly meals: IMealRepository) {}

  async execute(playerId: PlayerId, anyDay: DayKey): Promise<Result<WeekPlan, InventoryError>> {
    const days = weekOf(anyDay)
    const first = days[0]
    const last = days[days.length - 1]
    if (first === undefined || last === undefined) return ok({ days: [] })

    const found = await this.meals.findByPlayerBetween(playerId, first, last)
    if (!found.ok) {
      return err(
        new ApplicationError('WEEK_UNREADABLE', 'La semaine n’a pas pu être lue.', {
          cause: found.error,
        }),
      )
    }

    return ok({
      days: days.map((day) => {
        const meals = found.value.filter((meal) => meal.plannedFor === day).map(toMealSummary)
        return {
          day,
          meals,
          plannedCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
        }
      }),
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
      // Les siens seulement : ceux des autres membres du foyer, reçus par
      // synchronisation, appartiennent à leur auteur et à son propre export.
      customFoods: customFoods.value
        .filter((item) => item.ownerId === null || item.ownerId === playerId)
        .map(toFoodExport),
    })
  }
}

export async function loadMeal(
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

export async function saveMeal(
  meals: IMealRepository,
  meal: Meal,
): Promise<Result<Meal, InventoryError>> {
  const saved = await meals.save(meal)
  if (!saved.ok) {
    return err(
      new ApplicationError('MEAL_NOT_SAVED', 'Le repas n’a pas pu être enregistré.', {
        cause: saved.error,
      }),
    )
  }
  return ok(meal)
}
