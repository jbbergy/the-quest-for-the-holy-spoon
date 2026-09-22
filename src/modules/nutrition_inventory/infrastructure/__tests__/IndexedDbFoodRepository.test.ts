import { beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseProvider } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { Macros } from '@/core/nutrition/Macros'
import { isOk } from '@/core/result'
import { FoodItem, FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { IndexedDbFoodRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFoodRepository'

let databases: DatabaseProvider
let repository: IndexedDbFoodRepository

const foodOf = (
  name: string,
  macros: { proteinG: number; carbsG: number; fatG: number } = {
    proteinG: 10,
    carbsG: 5,
    fatG: 2,
  },
  extra: { barcode?: string; tags?: FoodTag[] } = {},
): FoodItem => {
  const result = FoodItem.create({
    name,
    macrosPer100g: Macros.reconstitute(macros),
    source: FoodSource.CIQUAL,
    ...extra,
  })
  if (!isOk(result)) throw new Error(`aliment de test invalide : ${name}`)
  return result.value
}

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbFoodRepository(databases)
})

describe('IndexedDbFoodRepository', () => {
  describe('aller-retour Entité ↔ stockage', () => {
    it('restitue une fiche identique à celle enregistrée', async () => {
      const original = foodOf(
        'Blanc de poulet',
        { proteinG: 21.2, carbsG: 0, fatG: 4.3 },
        { barcode: '3017620422003', tags: [FoodTag.CONTAINS_MEAT] },
      )
      unwrap(await repository.save(original))

      const found = unwrap(await repository.findById(original.id))

      expect(found).not.toBeNull()
      expect(found?.id).toBe(original.id)
      expect(found?.name).toBe('Blanc de poulet')
      expect(found?.macrosPer100g.equals(original.macrosPer100g)).toBe(true)
      expect(found?.barcode).toBe('3017620422003')
      expect(found?.hasTag(FoodTag.CONTAINS_MEAT)).toBe(true)
      expect(found?.source).toBe(FoodSource.CIQUAL)
    })

    it('restitue bien une instance du domaine, pas l’enregistrement brut', async () => {
      const original = foodOf('Riz')
      unwrap(await repository.save(original))

      const found = unwrap(await repository.findById(original.id))

      // Une méthode du domaine doit être appelable : c'est ce qui distingue une
      // réhydratation d'un simple `JSON.parse`.
      expect(isOk(found!.macrosForGrams(200))).toBe(true)
    })

    it('préserve l’absence de code-barres plutôt que de stocker undefined', async () => {
      const original = foodOf('Lentilles')
      unwrap(await repository.save(original))

      const found = unwrap(await repository.findById(original.id))

      expect(found?.barcode).toBeUndefined()
    })

    it('retourne null pour un identifiant inconnu, sans erreur', async () => {
      const found = unwrap(await repository.findById(foodOf('Fantôme').id))

      expect(found).toBeNull()
    })

    it('remplace la fiche existante lors d’un nouvel enregistrement', async () => {
      const original = foodOf('Poulet', { proteinG: 20, carbsG: 0, fatG: 10 })
      unwrap(await repository.save(original))
      unwrap(
        await repository.save(
          original.withMacros(Macros.reconstitute({ proteinG: 31, carbsG: 0, fatG: 3 })),
        ),
      )

      const found = unwrap(await repository.findById(original.id))

      expect(found?.macrosPer100g.proteinG).toBe(31)
      expect(unwrap(await repository.count())).toBe(1)
    })
  })

  describe('findByBarcode', () => {
    it('retrouve une fiche par son code-barres', async () => {
      const item = foodOf('Nutella', { proteinG: 6.3, carbsG: 57.5, fatG: 30.9 }, {
        barcode: '3017620422003',
      })
      unwrap(await repository.save(item))
      unwrap(await repository.save(foodOf('Autre')))

      const found = unwrap(await repository.findByBarcode('3017620422003'))

      expect(found?.name).toBe('Nutella')
    })

    it('retourne null pour un code-barres absent', async () => {
      unwrap(await repository.save(foodOf('Sans code')))

      expect(unwrap(await repository.findByBarcode('0000000000000'))).toBeNull()
    })

    it('n’indexe pas les fiches dépourvues de code-barres', async () => {
      // Une fiche Ciqual n'a pas de code-barres ; l'index ne doit pas la
      // retourner pour une recherche quelconque.
      unwrap(await repository.save(foodOf('Riz complet')))

      expect(unwrap(await repository.findByBarcode('3017620422003'))).toBeNull()
    })
  })

  describe('searchByName', () => {
    beforeEach(async () => {
      unwrap(
        await repository.saveMany([
          foodOf('Blanc de poulet, cru'),
          foodOf('Poulet rôti'),
          foodOf('Sauce au poulet et aux champignons de Paris'),
          foodOf('Crème fraîche épaisse'),
          foodOf('Riz blanc cuit'),
        ]),
      )
    })

    it('retrouve un aliment par un mot situé au milieu de son nom', async () => {
      const found = unwrap(await repository.searchByName('poulet'))

      // C'est l'apport de l'index multiEntry : un index sur le nom complet ne
      // trouverait jamais « Blanc de poulet » à partir de « poulet ».
      expect(found.map((item) => item.name)).toContain('Blanc de poulet, cru')
      expect(found).toHaveLength(3)
    })

    it('ignore accents et casse', async () => {
      const found = unwrap(await repository.searchByName('CREME FRAICHE'))

      expect(found.map((item) => item.name)).toContain('Crème fraîche épaisse')
    })

    it('exige que tous les mots de la requête correspondent', async () => {
      const found = unwrap(await repository.searchByName('poulet champignons'))

      expect(found).toHaveLength(1)
      expect(found[0]?.name).toBe('Sauce au poulet et aux champignons de Paris')
    })

    it('classe le nom le plus court en tête, à nombre de mots égal', async () => {
      const found = unwrap(await repository.searchByName('poulet'))

      expect(found[0]?.name).toBe('Poulet rôti')
    })

    it('accepte un préfixe de mot', async () => {
      const found = unwrap(await repository.searchByName('poul'))

      expect(found.length).toBeGreaterThan(0)
    })

    it('respecte la limite demandée', async () => {
      const found = unwrap(await repository.searchByName('poulet', 2))

      expect(found).toHaveLength(2)
    })

    it('ne retourne rien pour une requête vide ou réduite à des mots vides', async () => {
      expect(unwrap(await repository.searchByName(''))).toEqual([])
      expect(unwrap(await repository.searchByName('de la'))).toEqual([])
    })

    it('ne retourne rien plutôt que tout pour un terme absent', async () => {
      expect(unwrap(await repository.searchByName('cassoulet'))).toEqual([])
    })
  })

  describe('findBySource', () => {
    const userFoodOf = (name: string): FoodItem => {
      const result = FoodItem.create({
        name,
        macrosPer100g: Macros.reconstitute({ proteinG: 8, carbsG: 12, fatG: 3 }),
        source: FoodSource.USER,
      })
      if (!isOk(result)) throw new Error(`aliment de test invalide : ${name}`)
      return result.value
    }

    it('isole les fiches de l’utilisateur au milieu du catalogue', async () => {
      unwrap(await repository.save(foodOf('Blanc de poulet')))
      unwrap(await repository.save(foodOf('Riz blanc cuit')))
      unwrap(await repository.save(userFoodOf('Gratin de ma grand-mère')))
      unwrap(await repository.save(userFoodOf('Pain de mie maison')))

      const mine = unwrap(await repository.findBySource(FoodSource.USER))

      expect(mine.map((item) => item.name)).toEqual([
        'Gratin de ma grand-mère',
        'Pain de mie maison',
      ])
    })

    it('trie par nom, accents compris', async () => {
      unwrap(await repository.save(userFoodOf('Œufs brouillés')))
      unwrap(await repository.save(userFoodOf('Éclair au café')))
      unwrap(await repository.save(userFoodOf('Bœuf mijoté')))

      const mine = unwrap(await repository.findBySource(FoodSource.USER))

      // Tri français : « Éclair » se range à E, pas après Z comme le ferait un
      // tri par point de code.
      expect(mine.map((item) => item.name)).toEqual([
        'Bœuf mijoté',
        'Éclair au café',
        'Œufs brouillés',
      ])
    })

    it('retourne une liste vide quand rien n’a été créé par l’utilisateur', async () => {
      unwrap(await repository.save(foodOf('Blanc de poulet')))

      expect(unwrap(await repository.findBySource(FoodSource.USER))).toEqual([])
    })
  })

  describe('saveMany', () => {
    it('écrit un lot dépassant la taille d’une transaction', async () => {
      // Au-delà du seuil de découpage, pour vérifier que le lotissement ne perd
      // ni n'ignore d'enregistrement.
      const items = Array.from({ length: 1200 }, (_, i) => foodOf(`Aliment numéro ${i}`))

      unwrap(await repository.saveMany(items))

      expect(unwrap(await repository.count())).toBe(1200)
    })

    it('accepte un lot vide', async () => {
      unwrap(await repository.saveMany([]))

      expect(unwrap(await repository.count())).toBe(0)
    })
  })

  it('compte un catalogue vide sans erreur', async () => {
    expect(unwrap(await repository.count())).toBe(0)
  })

  it('convertit une base fermée en Result en échec plutôt qu’en exception', async () => {
    await databases.close()
    globalThis.indexedDB = undefined as unknown as IDBFactory

    const result = await repository.count()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('repository')
  })
})
