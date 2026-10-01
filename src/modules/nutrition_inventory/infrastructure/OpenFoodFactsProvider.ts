import { ExternalPayloadInvalidError, RemoteUnavailableError } from '@/core/errors'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { FoodItem, FoodSource, FoodTag } from '../domain/FoodItem'
import type { IRemoteFoodCatalog, ProviderError } from '../domain/providers'

import { nameTags } from './ciqualTags'
import {
  openFoodFactsResponseSchema,
  openFoodFactsSearchSchema,
  type OpenFoodFactsProduct,
  REQUESTED_FIELDS,
} from './openFoodFactsSchema'
import { portionsFromOpenFoodFacts } from './openFoodFactsPortions'

const DEFAULT_BASE_URL = 'https://world.openfoodfacts.org'
const DEFAULT_TIMEOUT_MS = 8000

/** Attente avant l'unique nouvelle tentative d'une recherche refusée d'emblée. */
const DEFAULT_SEARCH_RETRY_DELAY_MS = 800

/**
 * Plafond de requêtes de recherche envoyées par minute, nouvelles tentatives
 * comprises.
 *
 * Open Food Facts limite `/cgi/search.pl` à 10 requêtes par minute et par
 * adresse IP. Rester en dessous laisse une marge aux autres appareils du foyer,
 * qui partagent souvent la même adresse, et évite qu'une série de clics sur
 * « Chercher de nouveau » ne charge un service déjà saturé.
 */
const DEFAULT_SEARCH_BUDGET = { requests: 8, perMs: 60_000 } as const

/**
 * En-têtes envoyés : `Accept`, et rien d'autre.
 *
 * Pas de `User-Agent` personnalisé, bien que la politique d'usage d'Open Food
 * Facts en demande un : elle vise les scripts côté serveur, et un navigateur
 * envoie déjà le sien. Surtout, tout en-tête hors de la liste CORS « simple »
 * fait précéder chaque appel d'une requête `OPTIONS` de pré-vérification.
 * Chrome ignorait l'en-tête ; Firefox l'envoie, et `/cgi/search.pl` refusait
 * alors la pré-vérification une fois sur deux (mesuré le 2026-09-23) — une
 * recherche devait réussir deux requêtes d'affilée, et chargeait deux fois un
 * service saturé. Sans cet en-tête, une recherche est une seule requête.
 */
const REQUEST_HEADERS = { Accept: 'application/json' } as const

export interface OpenFoodFactsOptions {
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly searchRetryDelayMs?: number
  readonly searchBudget?: { readonly requests: number; readonly perMs: number }
  readonly fetchImpl?: typeof fetch
  /** Horloge en millisecondes, remplaçable par les tests. */
  readonly now?: () => number
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
  private readonly searchRetryDelayMs: number
  private readonly searchBudget: { readonly requests: number; readonly perMs: number }
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  /** Instants d'envoi des recherches encore comptées dans la fenêtre glissante. */
  private searchesSent: number[] = []

  constructor(
    private readonly network: INetworkStatus,
    options: OpenFoodFactsOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.searchRetryDelayMs = options.searchRetryDelayMs ?? DEFAULT_SEARCH_RETRY_DELAY_MS
    this.searchBudget = options.searchBudget ?? DEFAULT_SEARCH_BUDGET
    this.now = options.now ?? Date.now
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async findByBarcode(barcode: string): Promise<Result<FoodItem | null, ProviderError>> {
    if (!this.network.isOnline()) {
      return err(new RemoteUnavailableError('Recherche en ligne indisponible\u00A0: hors connexion.'))
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
      return err(new RemoteUnavailableError('Recherche en ligne indisponible\u00A0: hors connexion.'))
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

    const response = await this.getWithOneRetry(
      `${this.baseUrl}/cgi/search.pl?${params.toString()}`,
    )
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

  /**
   * Une recherche refusée d'emblée est retentée **une fois**, après un court
   * délai.
   *
   * Mesuré le 2026-09-23 : `/cgi/search.pl` refusait alors d'une requête sur
   * deux à trois sur quatre, par un 503 immédiat — que le navigateur, faute
   * d'en-têtes CORS sur la page d'erreur, voit comme une panne réseau. Les
   * refus étant indépendants d'une requête à l'autre, une seconde chance
   * suffit à en rattraper une bonne part ; davantage chargerait un service
   * déjà saturé, ce que sa politique d'usage demande d'éviter. Constat
   * identique le 2026-09-29 en production : 503, 200, 503 sur trois essais.
   *
   * Ne sont pas retentés : un délai dépassé (l'utilisateur a déjà attendu), un
   * 429 (le service demande explicitement de ralentir), ni une requête qui
   * dépasserait le plafond par minute.
   */
  private async getWithOneRetry(url: string): Promise<Result<unknown, ProviderError>> {
    const first = await this.searchWithinBudget(url)
    if (first.ok || isTimeout(first.error) || isRateLimited(first.error)) return first
    if (!this.hasSearchBudget()) return first

    await new Promise((resolve) => setTimeout(resolve, this.searchRetryDelayMs))
    return this.searchWithinBudget(url)
  }

  /**
   * Une recherche n'est envoyée que si le plafond par minute le permet ;
   * sinon elle échoue aussitôt, sans solliciter le réseau, comme une
   * indisponibilité ordinaire — l'écran propose déjà de réessayer plus tard.
   */
  private async searchWithinBudget(url: string): Promise<Result<unknown, ProviderError>> {
    if (!this.hasSearchBudget()) {
      return err(
        new RemoteUnavailableError('Recherche Open Food Facts suspendue\u00A0: trop de requêtes en une minute.'),
      )
    }
    this.searchesSent.push(this.now())
    return this.get(url)
  }

  private hasSearchBudget(): boolean {
    const windowStart = this.now() - this.searchBudget.perMs
    this.searchesSent = this.searchesSent.filter((sentAt) => sentAt > windowStart)
    return this.searchesSent.length < this.searchBudget.requests
  }

  /** Requête JSON commune aux deux chemins : délai borné, aucune exception qui sorte. */
  private async get(url: string): Promise<Result<unknown, ProviderError>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: REQUEST_HEADERS,
      })

      // 404 signifie « produit absent de la base » et porte un corps exploitable :
      // le traiter comme une panne priverait l'utilisateur de cette information.
      if (!response.ok && response.status !== 404) {
        return err(
          new RemoteUnavailableError(`Open Food Facts a répondu ${response.status}.`, {
            cause: { status: response.status },
          }),
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

function isTimeout(error: ProviderError): boolean {
  return error.cause instanceof Error && error.cause.name === 'AbortError'
}

function isRateLimited(error: ProviderError): boolean {
  const cause = error.cause as { status?: unknown } | undefined
  return cause?.status === 429
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
    ...portionsFromOpenFoodFacts(product),
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
  'en:crustaceans': FoodTag.CONTAINS_SHELLFISH,
  'en:molluscs': FoodTag.CONTAINS_SHELLFISH,
  'en:gluten': FoodTag.CONTAINS_GLUTEN,
  'en:milk': FoodTag.CONTAINS_MILK,
  'en:eggs': FoodTag.CONTAINS_EGG,
}

/** Ce que seul le nom d'un produit dit ; le reste vient de ses étiquettes. */
const NAMED_ONLY = [
  FoodTag.CONTAINS_PORK,
  FoodTag.CONTAINS_BEEF,
  FoodTag.CONTAINS_SHELLFISH,
  FoodTag.CONTAINS_ALCOHOL,
] as const

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

  // Aucun allergène ne signale la viande. L'analyse des ingrédients, elle, dit
  // « non végétarien » : c'est de la viande, sauf si le poisson l'explique déjà.
  const analysis = product.ingredients_analysis_tags ?? []
  const seafood = tags.has(FoodTag.CONTAINS_FISH) || tags.has(FoodTag.CONTAINS_SHELLFISH)
  if (analysis.includes('en:non-vegetarian') && !seafood) {
    tags.add(FoodTag.CONTAINS_MEAT)
  }

  // Ni le porc, ni le bœuf ne sont des allergènes : seul le nom les trahit
  // (« Jambon supérieur », « Steak haché pur bœuf »). L'alcool, lui, a un taux.
  for (const tag of nameTags(firstNonEmpty([product.product_name_fr, product.product_name]) ?? '', NAMED_ONLY)) tags.add(tag)
  if ((product.nutriments?.alcohol_100g ?? 0) > 0) tags.add(FoodTag.CONTAINS_ALCOHOL)

  // Végan implique végétarien : l'omettre ferait échouer un filtre « végétarien »
  // sur un produit pourtant compatible.
  if (tags.has(FoodTag.VEGAN)) tags.add(FoodTag.VEGETARIAN)

  return [...tags]
}
