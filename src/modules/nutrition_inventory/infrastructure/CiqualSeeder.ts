import { ExternalPayloadInvalidError, type RepositoryError, ValidationError } from '@/core/errors'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { META_KEY, STORE } from '@/core/infrastructure/database'
import { guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { FoodItem, FoodSource } from '../domain/FoodItem'
import type { IFoodRepository } from '../domain/repositories'

import { ciqualPortions } from './ciqualPortions'
import { ciqualTags } from './ciqualTags'
import { type CiqualFood, ciqualCatalogSchema } from './ciqualSchema'

/**
 * Version du jeu de données. L'incrémenter force un ré-amorçage au prochain
 * lancement : c'est le seul mécanisme de mise à jour du catalogue, et il doit
 * rester explicite plutôt que déduit d'une date de fichier.
 *
 * Passée à 2 avec l'ajout des fibres, sucres, AG saturés et sel : les fiches
 * déjà en base les ignorent, et seule une réécriture complète les leur donne.
 * C'est le bon usage du mécanisme — le catalogue est dérivé, donc jetable.
 *
 * Passée à 3 avec les portions usuelles et l'unité des liquides, pour la même
 * raison.
 *
 * Passée à 4 avec les marqueurs gluten, lait et œuf, déduits aussi des noms :
 * sans eux, le filtre des régimes ne masquerait que la viande et le poisson.
 * Passée à 5 avec le porc, le bœuf, les fruits de mer et l'alcool.
 */
export const CIQUAL_SEED_VERSION = 5

const DEFAULT_CATALOG_URL = '/data/ciqual.json'

export type SeedOutcome =
  | { readonly seeded: false; readonly reason: 'already_current' }
  | { readonly seeded: true; readonly count: number }

export interface CiqualSeederOptions {
  readonly catalogUrl?: string
  readonly fetchImpl?: typeof fetch
}

/**
 * Amorçage du catalogue local au premier lancement.
 *
 * Le catalogue Ciqual est la source de vérité hors-ligne de l'application :
 * tant qu'il n'est pas chargé, la recherche d'aliments ne renvoie rien. Le
 * seeding est donc idempotent et rejouable — un échec en cours de route laisse
 * la version enregistrée inchangée, et la tentative suivante repart proprement.
 */
export class CiqualSeeder {
  private readonly catalogUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly databases: DatabaseProvider,
    private readonly foods: IFoodRepository,
    options: CiqualSeederOptions = {},
  ) {
    this.catalogUrl = options.catalogUrl ?? DEFAULT_CATALOG_URL
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async seedIfNeeded(): Promise<Result<SeedOutcome, RepositoryError | ValidationError>> {
    const installed = await this.installedVersion()
    if (!installed.ok) return installed

    if (installed.value >= CIQUAL_SEED_VERSION) {
      return ok({ seeded: false, reason: 'already_current' })
    }

    const catalog = await this.loadCatalog()
    if (!catalog.ok) return catalog

    const items = toFoodItems(catalog.value)
    const saved = await this.foods.saveMany(items)
    if (!saved.ok) return saved

    // La version n'est inscrite qu'après l'écriture complète : un échec en cours
    // de route laisse le catalogue partiel, mais le prochain lancement le
    // réécrira intégralement plutôt que de le croire à jour.
    const marked = await this.markSeeded()
    if (!marked.ok) return marked

    return ok({ seeded: true, count: items.length })
  }

  private async installedVersion(): Promise<Result<number, RepositoryError>> {
    return guard('lecture de la version du catalogue', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meta, 'readonly')
      const record = await requestToPromise<{ key: string; value: number } | undefined>(
        tx.objectStore(STORE.meta).get(META_KEY.ciqualSeedVersion),
      )
      return record?.value ?? 0
    })
  }

  private async markSeeded(): Promise<Result<void, RepositoryError>> {
    return guard('enregistrement de la version du catalogue', async () => {
      const db = await this.databases.get()
      const tx = db.transaction(STORE.meta, 'readwrite')
      tx.objectStore(STORE.meta).put({
        key: META_KEY.ciqualSeedVersion,
        value: CIQUAL_SEED_VERSION,
      })
      await transactionToPromise(tx)
    })
  }

  private async loadCatalog(): Promise<Result<CiqualFood[], ValidationError>> {
    let payload: unknown
    try {
      const response = await this.fetchImpl(this.catalogUrl)
      if (!response.ok) {
        return err(
          new ValidationError(
            'CIQUAL_CATALOG_UNREACHABLE',
            `Catalogue Ciqual illisible (HTTP ${response.status}).`,
          ),
        )
      }
      payload = await response.json()
    } catch (cause) {
      return err(
        new ValidationError('CIQUAL_CATALOG_UNREACHABLE', 'Catalogue Ciqual illisible.', {
          cause,
        }),
      )
    }

    const parsed = ciqualCatalogSchema.safeParse(payload)
    if (!parsed.success) {
      return err(new ExternalPayloadInvalidError('catalogue Ciqual', { cause: parsed.error }))
    }
    return ok(parsed.data)
  }
}

/**
 * Traduction fiche Ciqual → `FoodItem`.
 *
 * L'identifiant est **dérivé du code Ciqual** et non tiré au hasard : un
 * ré-amorçage doit écraser les fiches existantes, pas en créer des doublons.
 */
function toFoodItems(catalog: readonly CiqualFood[]): FoodItem[] {
  const items: FoodItem[] = []

  for (const food of catalog) {
    const macros = Macros.create({
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
    })
    // Une fiche isolée invalide ne doit pas faire échouer les 3177 autres.
    if (!macros.ok) continue

    // Un catalogue produit par une version antérieure du convertisseur n'a pas
    // ces valeurs : la fiche reste utilisable, ses nutriments complémentaires
    // valent simplement zéro.
    const detail = NutrientDetail.create({
      fiberG: food.fiberG ?? 0,
      sugarsG: food.sugarsG ?? 0,
      saturatedFatG: food.saturatedFatG ?? 0,
      saltG: food.saltG ?? 0,
    })
    if (!detail.ok) continue

    items.push(
      FoodItem.reconstitute({
        id: idFrom(`ciqual:${food.code}`),
        name: food.name,
        macrosPer100g: macros.value,
        detailPer100g: detail.value,
        source: FoodSource.CIQUAL,
        tags: ciqualTags(food.subGroupCode, food.name),
        ...ciqualPortions(food.subGroupCode, food.name),
      }),
    )
  }

  return items
}
