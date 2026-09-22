import { ExternalPayloadInvalidError, RemoteUnavailableError } from '@/core/errors'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { FoodItem, FoodSource, FoodTag } from '../domain/FoodItem'
import type { IRemoteFoodCatalog, ProviderError } from '../domain/providers'

import {
  openFoodFactsResponseSchema,
  openFoodFactsSearchSchema,
  type OpenFoodFactsProduct,
  REQUESTED_FIELDS,
} from './openFoodFactsSchema'

const DEFAULT_BASE_URL = 'https://world.openfoodfacts.org'
const DEFAULT_TIMEOUT_MS = 8000

/** Requis par la politique d'usage de l'API Open Food Facts. */
const USER_AGENT = 'TheQuestForTheHolySpoon/0.1 (https://github.com/holy-spoon)'

export interface OpenFoodFactsOptions {
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

/**
 * Couche anti-corruption devant Open Food Facts.
 *
 * Trois responsabilités, et aucune autre : interroger l'API, **valider le JSON
 * par Zod**, et traduire le résultat en `FoodItem`. Rien de ce qui entre ici ne
 * ressort sous sa forme d'origine, et aucune exception ne franchit la frontière.
 */
export class OpenFoodFactsProvider implements IRemoteFoodCatalog {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly network: INetworkStatus,
    options: OpenFoodFactsOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async findByBarcode(barcode: string): Promise<Result<FoodItem | null, ProviderError>> {
    if (!this.network.isOnline()) {
      return err(new RemoteUnavailableError('Recherche en ligne indisponible : hors connexion.'))
    }

    const url = `${this.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${REQUESTED_FIELDS}`
    const response = await this.get(url)
    if (!response.ok) return response

    const parsed = openFoodFactsResponseSchema.safeParse(response.value)
    if (!parsed.success) {
      return err(new ExternalPayloadInvalidError('Open Food Facts', { cause: parsed.error }))
    }

    const { status, product } = parsed.data
    // Code inconnu : ce n'est pas une erreur, c'est une réponse. L'UI proposera
    // la saisie manuelle plutôt qu'un message d'échec.
    if (status === 0 || product === undefined) return ok(null)

    return toFoodItem(product, barcode)
  }

  /**
   * Recherche plein texte.
   *
   * Deux écarts assumés par rapport au chemin code-barres. D'abord, une fiche
   * inexploitable est **écartée** au lieu de faire échouer la requête : sur
   * vingt produits contributifs, un ou deux sans nom ni nutriments sont la
   * norme, et refuser le lot priverait l'utilisateur des dix-huit autres.
   * Ensuite, `/cgi/search.pl` est nettement plus limité en débit que la lecture
   * par code-barres — l'application ne cherche donc qu'à la validation d'un
   * formulaire, jamais à la frappe, et un HTTP 503 se traduit en « recherche en
   * ligne indisponible » plutôt qu'en erreur.
   */
  async searchByName(
    query: string,
    limit: number,
  ): Promise<Result<readonly FoodItem[], ProviderError>> {
    if (!this.network.isOnline()) {
      return err(new RemoteUnavailableError('Recherche en ligne indisponible : hors connexion.'))
    }

    const trimmed = query.trim()
    if (trimmed.length === 0) return ok([])

    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(limit),
      fields: REQUESTED_FIELDS,
    })

    const response = await this.get(`${this.baseUrl}/cgi/search.pl?${params.toString()}`)
    if (!response.ok) return response

    const parsed = openFoodFactsSearchSchema.safeParse(response.value)
    if (!parsed.success) {
      return err(new ExternalPayloadInvalidError('Open Food Facts (recherche)', {
        cause: parsed.error,
      }))
    }

    const items: FoodItem[] = []
    for (const product of parsed.data.products ?? []) {
      const barcode = typeof product.code === 'number' ? String(product.code) : product.code
      const translated = toFoodItem(product, barcode)
      if (translated.ok && translated.value !== null) items.push(translated.value)
    }
    return ok(items)
  }

  /** Requête JSON commune aux deux chemins : délai borné, aucune exception qui sorte. */
  private async get(url: string): Promise<Result<unknown, ProviderError>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      })

      // 404 signifie « produit absent de la base » et porte un corps exploitable :
      // le traiter comme une panne priverait l'utilisateur de cette information.
      if (!response.ok && response.status !== 404) {
        return err(
          new RemoteUnavailableError(`Open Food Facts a répondu ${response.status}.`),
        )
      }

      return ok(await response.json())
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      return err(
        new RemoteUnavailableError(
          aborted
            ? 'Open Food Facts n’a pas répondu dans le délai imparti.'
            : 'Open Food Facts est injoignable.',
          { cause },
        ),
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * Traduction produit → `FoodItem`.
 *
 * Un produit sans aucune donnée nutritionnelle est refusé : l'enregistrer
 * produirait une fiche à zéro calorie qui fausserait silencieusement tous les
 * totaux du joueur. Mieux vaut un message clair et une saisie manuelle.
 */
function toFoodItem(
  product: OpenFoodFactsProduct,
  barcode: string | undefined,
): Result<FoodItem | null, ProviderError> {
  const name = pickName(product)
  if (name === null) {
    return err(new ExternalPayloadInvalidError('Open Food Facts (produit sans nom)'))
  }

  const nutriments = product.nutriments
  const proteinG = nutriments?.proteins_100g
  const carbsG = nutriments?.carbohydrates_100g
  const fatG = nutriments?.fat_100g

  if (proteinG === undefined && carbsG === undefined && fatG === undefined) {
    return err(
      new ExternalPayloadInvalidError('Open Food Facts (aucune donnée nutritionnelle)'),
    )
  }

  const macros = Macros.create({
    proteinG: proteinG ?? 0,
    carbsG: carbsG ?? 0,
    fatG: fatG ?? 0,
  })
  if (!macros.ok) return err(macros.error)

  // Les nutriments complémentaires ne conditionnent pas l'acceptation du
  // produit : une fiche contributive à moitié remplie reste bien plus utile
  // qu'un refus, et l'absence vaut zéro comme partout ailleurs.
  const detail = NutrientDetail.create({
    fiberG: Math.max(0, nutriments?.fiber_100g ?? 0),
    sugarsG: Math.max(0, nutriments?.sugars_100g ?? 0),
    saturatedFatG: Math.max(0, nutriments?.['saturated-fat_100g'] ?? 0),
    saltG: saltFrom(nutriments),
  })
  if (!detail.ok) return err(detail.error)

  const item = FoodItem.create({
    name,
    macrosPer100g: macros.value,
    detailPer100g: detail.value,
    source: FoodSource.OPEN_FOOD_FACTS,
    // Un résultat de recherche peut arriver sans code exploitable ; la fiche
    // reste utile, elle ne sera simplement pas retrouvable au code-barres.
    ...(barcode === undefined ? {} : { barcode }),
    tags: toTags(product),
  })
  if (!item.ok) return err(item.error)

  return ok(item.value)
}

/**
 * Teneur en sel, en grammes.
 *
 * Open Food Facts renseigne tantôt `salt_100g`, tantôt seulement `sodium_100g`.
 * Le sel prime quand il existe ; sinon il est reconstitué par le facteur
 * conventionnel du règlement UE 1169/2011, sel = sodium × 2,5.
 */
function saltFrom(nutriments: OpenFoodFactsProduct['nutriments']): number {
  const salt = nutriments?.salt_100g
  if (salt !== undefined) return Math.max(0, salt)

  const sodium = nutriments?.sodium_100g
  return sodium === undefined ? 0 : Math.max(0, sodium * SODIUM_TO_SALT)
}

const SODIUM_TO_SALT = 2.5

/** Le nom français prime, avec la marque en complément quand elle existe. */
function pickName(product: OpenFoodFactsProduct): string | null {
  const base = firstNonEmpty([product.product_name_fr, product.product_name])
  if (base === null) return null

  const brand = firstNonEmpty([product.brands?.split(',')[0]])
  return brand === null || base.toLowerCase().includes(brand.toLowerCase())
    ? base
    : `${base} (${brand})`
}

function firstNonEmpty(values: readonly (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed !== undefined && trimmed.length > 0) return trimmed
  }
  return null
}

/**
 * Traduction des étiquettes Open Food Facts vers le vocabulaire du domaine.
 *
 * Les tags OFF sont préfixés par langue (`en:`, `fr:`) et leur nomenclature
 * évolue : cette table est exactement la frontière où cette instabilité doit
 * être absorbée.
 */
const LABEL_TO_TAG: Readonly<Record<string, FoodTag>> = {
  'en:no-gluten': FoodTag.GLUTEN_FREE,
  'en:gluten-free': FoodTag.GLUTEN_FREE,
  'en:no-lactose': FoodTag.LACTOSE_FREE,
  'en:lactose-free': FoodTag.LACTOSE_FREE,
  'en:vegetarian': FoodTag.VEGETARIAN,
  'en:vegan': FoodTag.VEGAN,
}

const ALLERGEN_TO_TAG: Readonly<Record<string, FoodTag>> = {
  'en:nuts': FoodTag.CONTAINS_NUTS,
  'en:peanuts': FoodTag.CONTAINS_NUTS,
  'en:fish': FoodTag.CONTAINS_FISH,
}

function toTags(product: OpenFoodFactsProduct): FoodTag[] {
  const tags = new Set<FoodTag>()

  for (const label of product.labels_tags ?? []) {
    const tag = LABEL_TO_TAG[label]
    if (tag !== undefined) tags.add(tag)
  }
  for (const allergen of product.allergens_tags ?? []) {
    const tag = ALLERGEN_TO_TAG[allergen]
    if (tag !== undefined) tags.add(tag)
  }

  // Végan implique végétarien : l'omettre ferait échouer un filtre « végétarien »
  // sur un produit pourtant compatible.
  if (tags.has(FoodTag.VEGAN)) tags.add(FoodTag.VEGETARIAN)

  return [...tags]
}
