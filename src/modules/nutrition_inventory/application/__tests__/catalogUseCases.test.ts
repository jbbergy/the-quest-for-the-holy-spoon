import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { err, isErr, ok, type Result } from '@/core/result'
import {
  CreateCustomFoodUseCase,
  FindFoodUseCase,
} from '@/modules/nutrition_inventory/application/useCases'
import { FoodItem, FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import {
  type IRemoteFoodCatalog,
  type ProviderError,
  RemoteUnavailableError,
} from '@/modules/nutrition_inventory/domain/providers'
import { InMemoryFoodRepository } from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'

let foods: InMemoryFoodRepository

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const foodOf = (name: string, barcode?: string): FoodItem =>
  FoodItem.reconstitute({
    id: idFrom(`f:${name}`),
    name,
    macrosPer100g: Macros.reconstitute({ proteinG: 5, carbsG: 10, fatG: 2 }),
    source: FoodSource.CIQUAL,
    ...(barcode === undefined ? {} : { barcode }),
  })

/** Catalogue distant contrôlé, sans réseau ni HTTP. */
const remoteReturning = (
  byBarcode: Result<FoodItem | null, ProviderError>,
  byName: Result<readonly FoodItem[], ProviderError> = ok([]),
): IRemoteFoodCatalog => ({
  findByBarcode: vi.fn(async () => byBarcode),
  searchByName: vi.fn(async () => byName),
})

const offItem = (name: string, barcode?: string): FoodItem =>
  FoodItem.reconstitute({
    id: idFrom(`off:${name}`),
    name,
    macrosPer100g: Macros.reconstitute({ proteinG: 6, carbsG: 57, fatG: 31 }),
    source: FoodSource.OPEN_FOOD_FACTS,
    ...(barcode === undefined ? {} : { barcode }),
  })

beforeEach(() => {
  foods = new InMemoryFoodRepository()
})

describe('FindFoodUseCase', () => {
  const finder = (remote: IRemoteFoodCatalog, online = true): FindFoodUseCase =>
    new FindFoodUseCase(foods, remote, new StaticNetworkStatus(online))

  describe('aiguillage de la saisie', () => {
    it('reconnaît un code-barres et emprunte la lecture par code', async () => {
      const remote = remoteReturning(ok(offItem('Nutella', '3017620422003')))

      const found = unwrap(await finder(remote).execute('3017620422003'))

      expect(found.kind).toBe('by_barcode')
      expect(remote.findByBarcode).toHaveBeenCalledWith('3017620422003')
      expect(remote.searchByName).not.toHaveBeenCalled()
    })

    it('tolère les espaces autour du code-barres', async () => {
      const remote = remoteReturning(ok(null))

      expect(unwrap(await finder(remote).execute('  3017620422003  ')).kind).toBe('by_barcode')
    })

    it.each([
      ['1234567', 'trop court'],
      ['123456789012345', 'trop long'],
      ['301762042200A', 'une lettre'],
      ['3017 6204 2200', 'des espaces internes'],
    ])('traite « %s » comme un nom (%s)', async (input) => {
      const remote = remoteReturning(ok(null))

      const found = unwrap(await finder(remote).execute(input))

      // Le doute profite au nom : lire un code-barres qui n'en est pas un
      // serait un appel garanti sans résultat.
      expect(found.kind).toBe('by_name')
      expect(remote.findByBarcode).not.toHaveBeenCalled()
    })
  })

  describe('fusion des deux catalogues', () => {
    it('réunit le local et le distant sur une recherche par nom', async () => {
      await foods.saveMany([foodOf('Blanc de poulet'), foodOf('Riz cuit')])
      const remote = remoteReturning(ok(null), ok([offItem('Poulet rôti Fleury', '3017620422003')]))

      const found = unwrap(await finder(remote).execute('poulet'))

      expect(found.items.map((item) => item.name)).toEqual([
        'Blanc de poulet',
        'Poulet rôti Fleury',
      ])
      expect(found.onlineSearched).toBe(true)
    })

    it('réunit le local et le distant sur un code-barres', async () => {
      // Un générique Ciqual porte le code ; le produit de marque existe aussi.
      await foods.save(foodOf('Pâte à tartiner', '3017620422003'))
      const remote = remoteReturning(ok(offItem('Nutella', '9999999999993')))

      const found = unwrap(await finder(remote).execute('3017620422003'))

      // L'ancienne version rendait « Nutella » invisible : le local répondait,
      // et le distant n'était jamais appelé.
      expect(found.items.map((item) => item.name)).toEqual(['Nutella', 'Pâte à tartiner'])
    })

    it('trie l’ensemble par nom, accents compris', async () => {
      await foods.save(foodOf('Eau'))
      const remote = remoteReturning(
        ok(null),
        ok([offItem('Farine', '1111111111116'), offItem('Élevé', '2222222222229')]),
      )

      const found = unwrap(await finder(remote).execute('eau'))

      // « Élevé » se range entre « Eau » et « Farine », ce qu'un tri sur les
      // points de code placerait après « Farine ».
      expect(found.items.map((item) => item.name)).toEqual(['Eau', 'Élevé', 'Farine'])
    })

    it('montre le produit de marque même si une fiche perso porte son code', async () => {
      // Le cas réel qui a révélé le défaut : une fiche saisie à la main avec le
      // code-barres du Nutella masquait complètement le Nutella.
      const mine = FoodItem.reconstitute({
        id: idFrom('user:test'),
        name: 'test',
        macrosPer100g: Macros.reconstitute({ proteinG: 0, carbsG: 0, fatG: 0 }),
        source: FoodSource.USER,
        barcode: '3017620422003',
      })
      await foods.save(mine)
      const remote = remoteReturning(ok(offItem('Nutella', '3017620422003')))

      const found = unwrap(await finder(remote).execute('3017620422003'))

      expect(found.items.map((item) => item.name)).toEqual(['Nutella', 'test'])
    })

    it('montre le produit de marque même si un générique Ciqual porte son code', async () => {
      await foods.save(foodOf('Pâte à tartiner aux noisettes', '3017620422003'))
      const remote = remoteReturning(ok(offItem('Nutella', '3017620422003')))

      const found = unwrap(await finder(remote).execute('3017620422003'))

      expect(found.items).toHaveLength(2)
    })

    it('ne duplique pas une fiche Open Food Facts déjà en cache', async () => {
      await foods.save(offItem('Nutella', '3017620422003'))
      // Même produit, identifiant neuf : c'est ce que produit une traduction
      // fraîche d'Open Food Facts.
      const remote = remoteReturning(ok(offItem('Nutella (Ferrero)', '3017620422003')))

      const found = unwrap(await finder(remote).execute('3017620422003'))

      expect(found.items).toHaveLength(1)
      // La copie locale l'emporte : son identifiant est déjà cité par les repas.
      expect(found.items[0]?.name).toBe('Nutella')
    })

    it('met les fiches distantes en cache pour l’ajout et le hors-ligne', async () => {
      const remote = remoteReturning(ok(null), ok([offItem('Galettes Bjorg', '3229820129488')]))

      await finder(remote).execute('galettes')

      const cached = unwrap(await foods.findByBarcode('3229820129488'))
      expect(cached?.name).toBe('Galettes Bjorg')
    })
  })

  describe('quand le distant fait défaut', () => {
    it('sert le catalogue local et le signale, hors connexion', async () => {
      await foods.save(foodOf('Blanc de poulet'))
      const remote = remoteReturning(ok(null))

      const found = unwrap(await finder(remote, false).execute('poulet'))

      expect(found.items.map((item) => item.name)).toEqual(['Blanc de poulet'])
      // C'est ce drapeau que l'UI traduit en « résultats du catalogue local
      // uniquement » plutôt qu'en liste complète.
      expect(found.onlineSearched).toBe(false)
      expect(remote.searchByName).not.toHaveBeenCalled()
    })

    it('sert le catalogue local et le signale quand le distant est en panne', async () => {
      await foods.save(foodOf('Blanc de poulet'))
      const remote = remoteReturning(ok(null), err(new RemoteUnavailableError('quota')))

      const found = unwrap(await finder(remote).execute('poulet'))

      expect(found.items).toHaveLength(1)
      expect(found.onlineSearched).toBe(false)
    })

    it('distingue « rien là-bas » d’une panne', async () => {
      const remote = remoteReturning(ok(null), ok([]))

      const found = unwrap(await finder(remote).execute('xyzzy'))

      expect(found.items).toEqual([])
      // Le distant a répondu : la liste vide est un verdict, pas un silence.
      expect(found.onlineSearched).toBe(true)
    })
  })

  it('échoue seulement quand le catalogue local est illisible', async () => {
    const broken = {
      searchByName: async () => err(Object.assign(new Error('panne'), { code: 'X' })),
      findByBarcode: async () => err(Object.assign(new Error('panne'), { code: 'X' })),
    } as unknown as InMemoryFoodRepository

    const result = await new FindFoodUseCase(
      broken,
      remoteReturning(ok(null)),
      new StaticNetworkStatus(true),
    ).execute('poulet')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('CATALOG_UNREADABLE')
  })
})

describe('CreateCustomFoodUseCase', () => {
  it('crée et enregistre un aliment de l’utilisateur', async () => {
    const item = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Tarte de mamie',
        proteinG: 5,
        carbsG: 40,
        fatG: 15,
        tags: [FoodTag.VEGETARIAN],
      }),
    )

    expect(item.source).toBe(FoodSource.USER)
    expect(item.hasTag(FoodTag.VEGETARIAN)).toBe(true)
    expect(unwrap(await foods.findById(item.id))?.name).toBe('Tarte de mamie')
  })

  it('refuse des macros négatives', async () => {
    const result = await new CreateCustomFoodUseCase(foods).execute({
      name: 'Impossible',
      proteinG: -1,
      carbsG: 0,
      fatG: 0,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MACROS')
  })

  it('refuse un nom vide', async () => {
    const result = await new CreateCustomFoodUseCase(foods).execute({
      name: '   ',
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_FOOD_ITEM')
  })

  it('n’enregistre rien quand la validation échoue', async () => {
    await new CreateCustomFoodUseCase(foods).execute({
      name: '',
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    })

    expect(unwrap(await foods.count())).toBe(0)
  })

  it('rend l’aliment immédiatement trouvable par la recherche', async () => {
    const item = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Gratin dauphinois maison',
        proteinG: 4,
        carbsG: 12,
        fatG: 9,
      }),
    )

    const found = unwrap(await new FindFoodUseCase(foods, remoteReturning(ok(null)), new StaticNetworkStatus(false)).execute('gratin'))

    expect(found.items.map((f) => f.id)).toContain(item.id)
  })
})
