import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseProvider } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { isErr, isOk } from '@/core/result'
import { FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { CiqualSeeder } from '@/modules/nutrition_inventory/infrastructure/CiqualSeeder'
import { IndexedDbFoodRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFoodRepository'

let databases: DatabaseProvider
let foods: IndexedDbFoodRepository

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

/** Échantillon fidèle au format produit par `scripts/build-ciqual.mjs`. */
const CATALOG = [
  {
    code: '36007',
    name: 'Poulet (var. blanc), viande et peau, cru',
    group: 'viandes, œufs, poissons et assimilés',
    subGroupCode: '0402',
    subGroup: 'viandes crues',
    proteinG: 21.2,
    carbsG: 0,
    fatG: 4.3,
  },
  {
    code: '20588',
    name: 'Lentille blonde, bouillie/cuite à l’eau',
    group: 'fruits, légumes, légumineuses et oléagineux',
    subGroupCode: '0203',
    subGroup: 'légumineuses',
    proteinG: 9.7,
    carbsG: 16.3,
    fatG: 0.7,
    fiberG: 4.95,
    sugarsG: 0.6,
    saturatedFatG: 0.1,
    saltG: 0.01,
  },
  {
    code: '15001',
    name: 'Amande (avec peau)',
    group: 'fruits, légumes, légumineuses et oléagineux',
    subGroupCode: '0205',
    subGroup: 'fruits à coque et graines oléagineuses',
    proteinG: 25.4,
    carbsG: 6.7,
    fatG: 53.4,
  },
  {
    code: '26010',
    name: 'Saumon, cru',
    group: 'viandes, œufs, poissons et assimilés',
    subGroupCode: '0406',
    subGroup: 'poissons crus',
    proteinG: 20.3,
    carbsG: 0,
    fatG: 12.4,
  },
]

const fetchReturning = (body: unknown, ok = true): typeof fetch =>
  vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })) as unknown as typeof fetch

const seederWith = (fetchImpl: typeof fetch): CiqualSeeder =>
  new CiqualSeeder(databases, foods, { fetchImpl, catalogUrl: '/data/ciqual.json' })

beforeEach(() => {
  databases = createTestDatabase()
  foods = new IndexedDbFoodRepository(databases)
})

describe('CiqualSeeder', () => {
  it('amorce le catalogue au premier lancement', async () => {
    const outcome = unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())

    expect(outcome).toEqual({ seeded: true, count: 4 })
    expect(unwrap(await foods.count())).toBe(4)
  })

  it('ne réamorce pas au lancement suivant', async () => {
    const fetchImpl = fetchReturning(CATALOG)
    unwrap(await seederWith(fetchImpl).seedIfNeeded())

    const outcome = unwrap(await seederWith(fetchImpl).seedIfNeeded())

    expect(outcome).toEqual({ seeded: false, reason: 'already_current' })
    // Le catalogue n'est même pas retéléchargé : c'est tout l'intérêt du marqueur
    // de version au premier lancement d'une PWA hors-ligne.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('dérive l’identifiant du code Ciqual, pour qu’un réamorçage écrase au lieu de dupliquer', async () => {
    unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())

    const found = unwrap(await foods.searchByName('saumon'))

    expect(found[0]?.id).toBe('ciqual:26010')
    expect(found[0]?.source).toBe(FoodSource.CIQUAL)
  })

  it('rend le catalogue immédiatement consultable par nom', async () => {
    unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())

    const found = unwrap(await foods.searchByName('lentille'))

    expect(found).toHaveLength(1)
    expect(found[0]?.macrosPer100g.carbsG).toBe(16.3)
  })

  describe('marqueurs diététiques', () => {
    beforeEach(async () => {
      unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())
    })

    it('marque la viande sans contaminer le poisson', async () => {
      const chicken = unwrap(await foods.findById('ciqual:36007' as never))
      const salmon = unwrap(await foods.findById('ciqual:26010' as never))

      // Les deux appartiennent au même groupe de premier niveau : c'est
      // précisément le piège que le sous-groupe évite.
      expect(chicken?.hasTag(FoodTag.CONTAINS_MEAT)).toBe(true)
      expect(salmon?.hasTag(FoodTag.CONTAINS_MEAT)).toBe(false)
      expect(salmon?.hasTag(FoodTag.CONTAINS_FISH)).toBe(true)
    })

    it('marque les fruits à coque', async () => {
      const almond = unwrap(await foods.findById('ciqual:15001' as never))

      expect(almond?.hasTag(FoodTag.CONTAINS_NUTS)).toBe(true)
    })

    it('ne marque rien pour un sous-groupe hors table', async () => {
      const lentils = unwrap(await foods.findById('ciqual:20588' as never))

      // Ne rien marquer laisse l'aliment visible ; le marquer à tort le ferait
      // disparaître à tort d'une recherche filtrée.
      expect(lentils?.tags).toEqual([])
    })
  })

  describe('nutriments complémentaires', () => {
    it('les charge depuis le catalogue', async () => {
      unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())

      const found = unwrap(await foods.searchByName('lentille'))

      expect(found[0]?.detailPer100g.toJSON()).toEqual({
        fiberG: 4.95,
        sugarsG: 0.6,
        saturatedFatG: 0.1,
        saltG: 0.01,
      })
    })

    it('tolère un catalogue produit par une version antérieure du convertisseur', async () => {
      // Les quatre clés sont facultatives au schéma : une régénération oubliée
      // doit laisser l'application démarrable, pas la vider de son catalogue.
      unwrap(await seederWith(fetchReturning(CATALOG)).seedIfNeeded())

      const found = unwrap(await foods.searchByName('poulet'))

      expect(found).toHaveLength(1)
      expect(found[0]?.detailPer100g.isZero()).toBe(true)
    })
  })

  describe('catalogue dégradé', () => {
    it('refuse un catalogue de forme inattendue', async () => {
      const result = await seederWith(fetchReturning({ oups: true })).seedIfNeeded()

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
      expect(unwrap(await foods.count())).toBe(0)
    })

    it('refuse une fiche aux macros négatives plutôt que de l’accepter', async () => {
      const result = await seederWith(
        fetchReturning([{ ...CATALOG[0], proteinG: -1 }]),
      ).seedIfNeeded()

      expect(isErr(result)).toBe(true)
    })

    it('signale un catalogue introuvable sans lever', async () => {
      const result = await seederWith(fetchReturning(null, false)).seedIfNeeded()

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('CIQUAL_CATALOG_UNREACHABLE')
    })

    it('signale une panne réseau sans lever', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch

      const result = await seederWith(fetchImpl).seedIfNeeded()

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('CIQUAL_CATALOG_UNREACHABLE')
    })

    it('laisse la version non marquée après un échec, pour rejouer au lancement suivant', async () => {
      unwrap(
        await seederWith(fetchReturning(null, false)).seedIfNeeded().then((r) =>
          r.ok ? r : { ok: true as const, value: null },
        ),
      )

      const retry = await seederWith(fetchReturning(CATALOG)).seedIfNeeded()

      expect(isOk(retry)).toBe(true)
      if (isOk(retry)) expect(retry.value).toEqual({ seeded: true, count: 4 })
    })

    it('accepte un catalogue vide sans échouer', async () => {
      const outcome = unwrap(await seederWith(fetchReturning([])).seedIfNeeded())

      expect(outcome).toEqual({ seeded: true, count: 0 })
    })
  })
})
