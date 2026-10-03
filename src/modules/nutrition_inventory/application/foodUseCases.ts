/**
 * Use Cases des aliments : la recherche (catalogue local, puis Open Food Facts)
 * et les aliments créés à la main.
 */
import { ApplicationError, type RepositoryError } from '@/core/errors'
import type { FoodItemId, PlayerId } from '@/core/identity'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { tokenize } from '@/core/infrastructure/text'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { type Diet, DietSuitability } from '../domain/DietSuitability'
import { FoodItem, FoodSource, type FoodTag, isBarcode } from '../domain/FoodItem'
import { BaseUnit } from '../domain/Measure'
import type { IRemoteFoodCatalog } from '../domain/providers'
import type { IFoodRepository } from '../domain/repositories'

import { type InventoryError } from './shared'

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
  /**
   * Catalogue local et distant réunis, les plus pertinents d'abord pour une
   * recherche par nom (`byRelevance`), par nom pour un code-barres.
   */
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
    const merged = [...local.value.map((item) => current.get(item.id) ?? item), ...fresh]
    const found = kind === 'by_name' ? byRelevance(merged, trimmed) : byName(merged)
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

/**
 * Classement d'une recherche par nom : l'aliment que l'on cherche avant ceux
 * qui le contiennent.
 *
 * Trié par nom, « raisin » sortait « Chocolat au lait aux fruits secs (…,
 * raisins, …) » et « Huile de pépins de raisin » avant « Raisin, cru ». Trois
 * critères, dans l'ordre :
 *
 * 1. le nom **commence** par le premier mot tapé : « Raisin noir, cru » oui,
 *    « Jus de raisin » non ;
 * 2. les fiches de référence et les vôtres avant Open Food Facts : un produit
 *    de marque est presque toujours une préparation, l'aliment brut est chez
 *    Ciqual ;
 * 3. le nom le plus court en mots — « Raisin, cru » avant « Raisin Chasselas,
 *    cru » —, puis l'ordre alphabétique pour départager.
 */
function byRelevance(items: readonly FoodItem[], query: string): readonly FoodItem[] {
  const [first] = tokenize(query)
  const ranked = items.map((item) => {
    const tokens = tokenize(item.name)
    return {
      item,
      leading: first !== undefined && tokens[0]?.startsWith(first) === true ? 0 : 1,
      remote: item.source === FoodSource.OPEN_FOOD_FACTS ? 1 : 0,
      words: tokens.length,
    }
  })
  return ranked
    .sort(
      (a, b) =>
        a.leading - b.leading ||
        a.remote - b.remote ||
        a.words - b.words ||
        a.item.name.localeCompare(b.item.name, 'fr'),
    )
    .map((entry) => entry.item)
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
      new ApplicationError('FOOD_NOT_SAVED', `L’aliment «\u00A0${item.name}\u00A0» n’a pas pu être enregistré.`, {
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
