import { ExternalPayloadInvalidError, type RepositoryError, ValidationError } from '@/core/errors'
import type { DatabaseProvider } from '@/core/infrastructure/database'
import { META_KEY, STORE } from '@/core/infrastructure/database'
import { guard, requestToPromise, transactionToPromise } from '@/core/infrastructure/idb'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { err, ok, type Result } from '@/core/result'

import { FoodItem, FoodSource, type FoodTag } from '../domain/FoodItem'
import type { IFoodRepository } from '../domain/repositories'

import { type CiqualFood, ciqualCatalogSchema } from './ciqualSchema'

/**
 * Version du jeu de données. L'incrémenter force un ré-amorçage au prochain
 * lancement : c'est le seul mécanisme de mise à jour du catalogue, et il doit
 * rester explicite plutôt que déduit d'une date de fichier.
 *
 * Passée à 2 avec l'ajout des fibres, sucres, AG saturés et sel : les fiches
 * déjà en base les ignorent, et seule une réécriture complète les leur donne.
 * C'est le bon usage du mécanisme — le catalogue est dérivé, donc jetable.
 */
export const CIQUAL_SEED_VERSION = 2

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
        tags: tagsForSubGroup(food.subGroupCode),
      }),
    )
  }

  return items
}

/**
 * Marqueurs déduits du **sous-groupe** Ciqual.
 *
 * Le groupe de premier niveau est inutilisable ici : « viandes, œufs, poissons
 * et assimilés » réunit 788 aliments, et marquer tout ce lot `CONTAINS_MEAT`
 * classerait les œufs et le saumon comme de la viande. Le second niveau sépare
 * « viandes crues », « poissons cuits » ou « œufs », ce qui rend la déduction
 * sûre.
 *
 * La table reste volontairement incomplète : ces marqueurs servent à **exclure**
 * un aliment incompatible, jamais à affirmer qu'il convient. Ne rien marquer
 * laisse l'aliment visible ; le marquer à tort le ferait disparaître à tort.
 */
const SUBGROUP_TAGS: Readonly<Record<string, readonly FoodTag[]>> = {
  '0205': ['CONTAINS_NUTS'], // fruits à coque et graines oléagineuses
  '0401': ['CONTAINS_MEAT'], // viandes cuites
  '0402': ['CONTAINS_MEAT'], // viandes crues
  '0403': ['CONTAINS_MEAT'], // charcuteries et assimilés
  '0404': ['CONTAINS_MEAT'], // autres produits à base de viande
  '0405': ['CONTAINS_FISH'], // poissons cuits
  '0406': ['CONTAINS_FISH'], // poissons crus
  '0407': ['CONTAINS_FISH'], // mollusques et crustacés cuits
  '0408': ['CONTAINS_FISH'], // mollusques et crustacés crus
  '0409': ['CONTAINS_FISH'], // produits à base de poissons et de la mer
}

function tagsForSubGroup(subGroupCode: string): FoodTag[] {
  return [...(SUBGROUP_TAGS[subGroupCode] ?? [])]
}
