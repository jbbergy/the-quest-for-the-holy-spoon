import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { err, isErr, ok, type Result } from '@/core/result'
import {
  BrowseCustomFoodsUseCase,
  CreateCustomFoodUseCase,
  DeleteFoodUseCase,
  FindFoodUseCase,
  GetFoodUseCase,
  UpdateCustomFoodUseCase,
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
      // La copie locale garde son identifiant, déjà cité par les repas…
      expect(found.items[0]?.id).toBe(idFrom('off:Nutella'))
      // …mais prend le contenu à jour de la version en ligne.
      expect(found.items[0]?.name).toBe('Nutella (Ferrero)')
      expect(unwrap(await foods.findById(idFrom('off:Nutella')))?.name).toBe('Nutella (Ferrero)')
    })

    it('met à jour les valeurs d’une copie en cache corrigée en ligne', async () => {
      await foods.save(offItem('Nutella', '3017620422003'))
      const corrected = FoodItem.reconstitute({
        id: idFrom('off:frais'),
        name: 'Nutella',
        macrosPer100g: Macros.reconstitute({ proteinG: 6.3, carbsG: 57.5, fatG: 30.9 }),
        source: FoodSource.OPEN_FOOD_FACTS,
        barcode: '3017620422003',
      })

      unwrap(await finder(remoteReturning(ok(corrected))).execute('3017620422003'))

      const cached = unwrap(await foods.findById(idFrom('off:Nutella')))
      expect(cached?.macrosPer100g.proteinG).toBe(6.3)
      expect(unwrap(await foods.count())).toBe(1)
    })

    it('ne réécrit pas une copie déjà à jour', async () => {
      const copy = offItem('Nutella', '3017620422003')
      await foods.save(copy)
      const saveMany = vi.spyOn(foods, 'saveMany')

      unwrap(await finder(remoteReturning(ok(offItem('Nutella', '3017620422003')))).execute('3017620422003'))

      expect(saveMany).not.toHaveBeenCalled()
    })

    it('donne à la copie en cache les portions de la version fraîche', async () => {
      await foods.save(offItem('Pain de mie', '3228857000166'))
      const fresh = unwrap(
        offItem('Pain de mie (Harrys)', '3228857000166').withPortions({
          servings: [{ label: 'tranche', grams: 25, approximate: false }],
        }),
      )

      const found = unwrap(await finder(remoteReturning(ok(fresh))).execute('3228857000166'))

      // Même fiche, même identifiant — mais mesurable en tranches.
      expect(found.items[0]?.id).toBe(idFrom('off:Pain de mie'))
      expect(found.items[0]?.servings.map((serving) => serving.label)).toEqual(['tranche'])
      const cached = unwrap(await foods.findByBarcode('3228857000166'))
      expect(cached?.servings).toHaveLength(1)
      expect(cached?.name).toBe('Pain de mie (Harrys)')
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

  it('enregistre l’unité et les portions saisies', async () => {
    const item = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Gâteau de mamie',
        proteinG: 5,
        carbsG: 40,
        fatG: 15,
        servings: [{ label: 'part', grams: 120 }],
      }),
    )
    const juice = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Jus maison',
        proteinG: 0.5,
        carbsG: 10,
        fatG: 0,
        unit: 'ml',
        servings: [{ label: 'verre', grams: 200 }],
      }),
    )

    expect(item.unit).toBe('g')
    expect(item.measures.map((measure) => measure.label)).toEqual(['g', 'part'])
    expect(item.servings[0]).toEqual({ label: 'part', grams: 120, approximate: false })
    expect(juice.baseMeasure).toEqual({ label: 'ml', grams: 1, countable: false, approximate: false })
  })

  it('refuse une portion sans nom, sans poids ou en double', async () => {
    const create = (servings: { label: string; grams: number }[]) =>
      new CreateCustomFoodUseCase(foods).execute({ name: 'Gâteau', proteinG: 5, carbsG: 40, fatG: 15, servings })

    expect(isErr(await create([{ label: ' ', grams: 100 }]))).toBe(true)
    expect(isErr(await create([{ label: 'part', grams: 0 }]))).toBe(true)
    expect(isErr(await create([{ label: 'part', grams: 100 }, { label: 'Part', grams: 90 }]))).toBe(true)
    expect(isErr(await create([{ label: 'g', grams: 1 }]))).toBe(true)
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

describe('gestion du catalogue local', () => {
  const me = idFrom<'PlayerId'>('player-1')
  const alex = idFrom<'PlayerId'>('player-alex')

  const userFood = (name: string, ownerId: typeof me | null): FoodItem =>
    FoodItem.reconstitute({
      id: idFrom(`user:${name}`),
      name,
      macrosPer100g: Macros.reconstitute({ proteinG: 5, carbsG: 40, fatG: 15 }),
      source: FoodSource.USER,
      ownerId,
      servings: [{ label: 'part', grams: 120, approximate: false }],
    })

  const mine = userFood('Tarte de mamie', me)
  const theirs = userFood('Cake d’Alex', alex)
  const orphan = userFood('Vieille recette', null)
  const ciqual = foodOf('Riz cuit')
  const cached = offItem('Nutella', '3017620422003')

  const edit = { name: 'Tarte de mamie, allégée', proteinG: 5, carbsG: 30, fatG: 10 }

  beforeEach(async () => {
    unwrap(await foods.saveMany([mine, theirs, orphan, ciqual, cached]))
  })

  describe('UpdateCustomFoodUseCase', () => {
    const update = () => new UpdateCustomFoodUseCase(foods)

    it('corrige son aliment en gardant identifiant et auteur', async () => {
      const updated = unwrap(
        await update().execute(mine.id, { ...edit, ownerId: alex, servings: [{ label: 'part', grams: 100 }] }, me),
      )

      expect(updated.id).toBe(mine.id)
      expect(updated.ownerId).toBe(me)
      expect(updated.name).toBe('Tarte de mamie, allégée')
      expect(updated.servings[0]?.grams).toBe(100)
      expect(unwrap(await foods.findById(mine.id))?.macrosPer100g.carbsG).toBe(30)
    })

    it('laisse corriger un aliment sans auteur, antérieur au partage', async () => {
      expect((await update().execute(orphan.id, edit, me)).ok).toBe(true)
    })

    it('refuse l’aliment d’un autre membre et les fiches de référence', async () => {
      const refused = async (id: FoodItem['id']) => {
        const result = await update().execute(id, edit, me)
        return isErr(result) ? result.error.code : 'accepté'
      }

      expect(await refused(theirs.id)).toBe('NOT_OWNER')
      expect(await refused(ciqual.id)).toBe('FOOD_READ_ONLY')
      expect(await refused(cached.id)).toBe('FOOD_READ_ONLY')
      expect(await refused(idFrom('inconnu'))).toBe('FOOD_NOT_FOUND')
      expect(unwrap(await foods.findById(theirs.id))?.name).toBe('Cake d’Alex')
    })

    it('valide comme à la création', async () => {
      expect(isErr(await update().execute(mine.id, { ...edit, name: ' ' }, me))).toBe(true)
    })
  })

  describe('DeleteFoodUseCase', () => {
    const remove = () => new DeleteFoodUseCase(foods)

    it('supprime son aliment', async () => {
      unwrap(await remove().execute(mine.id, me))

      expect(unwrap(await foods.findById(mine.id))).toBeNull()
    })

    it('garde les fiches de référence et les aliments des autres', async () => {
      const code = async (id: FoodItem['id']) => {
        const result = await remove().execute(id, me)
        return isErr(result) ? result.error.code : 'accepté'
      }

      expect(await code(ciqual.id)).toBe('FOOD_READ_ONLY')
      expect(await code(cached.id)).toBe('FOOD_READ_ONLY')
      expect(await code(theirs.id)).toBe('NOT_OWNER')
      expect(unwrap(await foods.count())).toBe(5)
    })
  })

  describe('GetFoodUseCase', () => {
    it('lit une fiche, ou dit qu’elle n’existe pas', async () => {
      expect(unwrap(await new GetFoodUseCase(foods).execute(mine.id)).name).toBe('Tarte de mamie')
      const missing = await new GetFoodUseCase(foods).execute(idFrom('inconnu'))
      expect(isErr(missing) && missing.error.code).toBe('FOOD_NOT_FOUND')
    })
  })

  describe('BrowseCustomFoodsUseCase', () => {
    const browse = (query?: string) => new BrowseCustomFoodsUseCase(foods).execute(query)
    const names = (items: readonly FoodItem[]) => items.map((item) => item.name)

    it('ne montre que les aliments saisis à la main, les siens comme ceux du foyer', async () => {
      expect(names(unwrap(await browse()))).toEqual(['Cake d’Alex', 'Tarte de mamie', 'Vieille recette'])
    })

    it('cherche par nom, sans jamais remonter Ciqual ni Open Food Facts', async () => {
      expect(names(unwrap(await browse('tarte')))).toEqual(['Tarte de mamie'])
      expect(unwrap(await browse('riz'))).toEqual([])
      expect(unwrap(await browse('nutella'))).toEqual([])
    })
  })
})
