import { beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseProvider } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { Quantity } from '@/core/nutrition/Quantity'
import { isOk } from '@/core/result'
import { FoodItem, FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import { MealEntry } from '@/modules/nutrition_inventory/domain/MealEntry'
import { IndexedDbMealRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbMealRepository'

let databases: DatabaseProvider
let repository: IndexedDbMealRepository

const playerId: PlayerId = idFrom('player-1')
const otherPlayerId: PlayerId = idFrom('player-2')

const chicken = FoodItem.reconstitute({
  id: idFrom('ciqual:36007'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 21.2, carbsG: 0, fatG: 4.3 }),
  detailPer100g: NutrientDetail.reconstitute({
    fiberG: 0,
    sugarsG: 0,
    saturatedFatG: 3,
    saltG: 0.2,
  }),
  source: FoodSource.CIQUAL,
  tags: [FoodTag.CONTAINS_MEAT],
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

const entryOf = (grams: number): MealEntry =>
  unwrap(MealEntry.fromFoodItem(chicken, Quantity.reconstitute(grams)))

const mealOf = (options: {
  loggedAt: Date
  type?: MealType
  player?: PlayerId
  entries?: MealEntry[]
}): Meal =>
  unwrap(
    Meal.create({
      playerId: options.player ?? playerId,
      type: options.type ?? MealType.LUNCH,
      loggedAt: options.loggedAt,
      entries: options.entries ?? [entryOf(150)],
    }),
  )

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbMealRepository(databases)
})

describe('IndexedDbMealRepository', () => {
  describe('aller-retour Entité ↔ stockage', () => {
    it('restitue un repas complet, instantanés compris', async () => {
      const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
      unwrap(await repository.save(meal))

      const found = unwrap(await repository.findById(meal.id))

      expect(found).not.toBeNull()
      expect(found?.id).toBe(meal.id)
      expect(found?.type).toBe(MealType.LUNCH)
      expect(found?.entryCount).toBe(1)
      expect(found?.entries[0]?.foodName).toBe('Blanc de poulet')
      expect(found?.entries[0]?.quantity.grams).toBe(150)
      expect(found?.entries[0]?.hasTag(FoodTag.CONTAINS_MEAT)).toBe(true)
    })

    it('préserve les totaux au bit près à travers la sérialisation', async () => {
      const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
      const before = meal.calculateTotals()
      unwrap(await repository.save(meal))

      const found = unwrap(await repository.findById(meal.id))

      expect(found?.calculateTotals().macros.equals(before.macros)).toBe(true)
      expect(found?.calculateTotals().calories).toBe(before.calories)
    })

    it('restitue une date équivalente à l’instant enregistré', async () => {
      const loggedAt = new Date('2026-03-15T12:30:45.123Z')
      const meal = mealOf({ loggedAt })
      unwrap(await repository.save(meal))

      const found = unwrap(await repository.findById(meal.id))

      expect(found?.loggedAt.getTime()).toBe(loggedAt.getTime())
    })

    it('restitue un repas vide', async () => {
      const meal = mealOf({ loggedAt: new Date('2026-03-15T09:00:00'), entries: [] })
      unwrap(await repository.save(meal))

      const found = unwrap(await repository.findById(meal.id))

      expect(found?.isEmpty).toBe(true)
    })

    it('retourne null pour un identifiant inconnu', async () => {
      expect(unwrap(await repository.findById(idFrom('inconnu')))).toBeNull()
    })
  })

  describe('findByPlayerAndDay', () => {
    it('ne retourne que les repas du joueur et du jour demandés', async () => {
      const day = new Date('2026-03-15T00:00:00')
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-03-15T08:00:00') })))
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })))
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-03-16T12:30:00') })))
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T12:30:00'), player: otherPlayerId }),
        ),
      )

      const found = unwrap(await repository.findByPlayerAndDay(playerId, day))

      expect(found).toHaveLength(2)
    })

    it('trie les repas chronologiquement', async () => {
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T19:00:00'), type: MealType.DINNER }),
        ),
      )
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T07:00:00'), type: MealType.BREAKFAST }),
        ),
      )
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T12:00:00'), type: MealType.LUNCH }),
        ),
      )

      const found = unwrap(
        await repository.findByPlayerAndDay(playerId, new Date('2026-03-15T00:00:00')),
      )

      expect(found.map((meal) => meal.type)).toEqual([
        MealType.BREAKFAST,
        MealType.LUNCH,
        MealType.DINNER,
      ])
    })

    it('rattache un repas tardif à la journée locale de l’utilisateur', async () => {
      // 22 h 30 heure locale : découper sur l'UTC rangerait ce dîner au lendemain
      // pour tout fuseau à l'est de Greenwich.
      const loggedAt = new Date('2026-03-15T22:30:00')
      unwrap(await repository.save(mealOf({ loggedAt, type: MealType.DINNER })))

      const sameDay = unwrap(
        await repository.findByPlayerAndDay(playerId, new Date('2026-03-15T10:00:00')),
      )
      const nextDay = unwrap(
        await repository.findByPlayerAndDay(playerId, new Date('2026-03-16T10:00:00')),
      )

      expect(sameDay).toHaveLength(1)
      expect(nextDay).toHaveLength(0)
    })

    it('retourne une liste vide pour une journée sans repas', async () => {
      const found = unwrap(
        await repository.findByPlayerAndDay(playerId, new Date('2026-01-01T12:00:00')),
      )

      expect(found).toEqual([])
    })
  })

  describe('findAllByPlayer', () => {
    it('traverse les journées et les mois, sans sortir du joueur demandé', async () => {
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-01-03T08:00:00') })))
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })))
      unwrap(await repository.save(mealOf({ loggedAt: new Date('2026-11-28T19:00:00') })))
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T12:30:00'), player: otherPlayerId }),
        ),
      )

      const found = unwrap(await repository.findAllByPlayer(playerId))

      expect(found).toHaveLength(3)
      expect(found.every((meal) => meal.playerId === playerId)).toBe(true)
    })

    it('trie du plus ancien au plus récent', async () => {
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-11-28T19:00:00'), type: MealType.DINNER }),
        ),
      )
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-01-03T08:00:00'), type: MealType.BREAKFAST }),
        ),
      )
      unwrap(
        await repository.save(
          mealOf({ loggedAt: new Date('2026-03-15T12:30:00'), type: MealType.LUNCH }),
        ),
      )

      const found = unwrap(await repository.findAllByPlayer(playerId))

      expect(found.map((meal) => meal.type)).toEqual([
        MealType.BREAKFAST,
        MealType.LUNCH,
        MealType.DINNER,
      ])
    })

    it('retourne une liste vide pour un joueur sans historique', async () => {
      expect(unwrap(await repository.findAllByPlayer(idFrom('inconnu')))).toEqual([])
    })
  })

  describe('écriture', () => {
    it('remplace un repas existant sans le dupliquer', async () => {
      const meal = mealOf({ loggedAt: new Date('2026-03-15T12:00:00') })
      unwrap(await repository.save(meal))

      const updated = unwrap(meal.addEntry(entryOf(50)))
      unwrap(await repository.save(updated))

      const found = unwrap(
        await repository.findByPlayerAndDay(playerId, new Date('2026-03-15T12:00:00')),
      )
      expect(found).toHaveLength(1)
      expect(found[0]?.entryCount).toBe(2)
    })

    it('supprime un repas', async () => {
      const meal = mealOf({ loggedAt: new Date('2026-03-15T12:00:00') })
      unwrap(await repository.save(meal))

      unwrap(await repository.delete(meal.id))

      expect(unwrap(await repository.findById(meal.id))).toBeNull()
    })

    it('supprimer un repas absent ne lève pas', async () => {
      const result = await repository.delete(idFrom('inconnu'))

      expect(isOk(result)).toBe(true)
    })
  })

  it('convertit une panne de stockage en Result en échec', async () => {
    await databases.close()
    globalThis.indexedDB = undefined as unknown as IDBFactory

    const result = await repository.findById(idFrom('peu-importe'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('repository')
  })
})

describe('persistance de l’état « pris »', () => {
  it('restitue un repas prévu comme prévu', async () => {
    const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
    unwrap(await repository.save(meal))

    const found = unwrap(await repository.findById(meal.id))

    expect(found?.isConsumed).toBe(false)
  })

  it('restitue l’heure de consommation à la minute près', async () => {
    const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
    const eaten = meal.markConsumed(new Date('2026-03-15T12:45:00'))
    if (!isOk(eaten)) throw new Error('marquage échoué')
    unwrap(await repository.save(eaten.value))

    const found = unwrap(await repository.findById(meal.id))

    expect(found?.consumedAt?.getTime()).toBe(new Date('2026-03-15T12:45:00').getTime())
  })

  it('compte comme pris un repas enregistré avant l’introduction de l’état', async () => {
    const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
    unwrap(await repository.save(meal))

    // On simule un enregistrement d'ancienne génération : la clé `consumedAt`
    // n'existait pas. Le relire comme « prévu » viderait rétroactivement les
    // jauges de tout l'historique de l'utilisateur.
    await stripKeys(databases, meal.id, { root: ['consumedAt'] })

    const found = unwrap(await repository.findById(meal.id))

    expect(found?.isConsumed).toBe(true)
    expect(found?.consumedAt?.getTime()).toBe(found?.loggedAt.getTime())
  })
})

describe('persistance des nutriments complémentaires', () => {
  it('restitue fibres, sucres, AG saturés et sel à l’identique', async () => {
    const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
    unwrap(await repository.save(meal))

    const found = unwrap(await repository.findById(meal.id))

    const detail = found?.calculateTotals().detail
    expect(detail?.saturatedFatG).toBeCloseTo(4.5, 9)
    expect(detail?.saltG).toBeCloseTo(0.3, 9)
  })

  it('lit à zéro un repas enregistré avant leur introduction', async () => {
    const meal = mealOf({ loggedAt: new Date('2026-03-15T12:30:00') })
    unwrap(await repository.save(meal))

    // Enregistrement d'ancienne génération : ces quatre clés n'existaient pas
    // sur les lignes de repas.
    await stripKeys(databases, meal.id, {
      entries: ['fiberG', 'sugarsG', 'saturatedFatG', 'saltG'],
    })

    const found = unwrap(await repository.findById(meal.id))

    // Zéro, et non une estimation rétroactive : l'instantané figé à l'époque ne
    // portait pas ces valeurs, et rien ne permet de les reconstituer.
    expect(found?.calculateTotals().detail.isZero()).toBe(true)
    // Le reste du repas, lui, est intact.
    expect(found?.calculateTotals().macros.proteinG).toBeCloseTo(31.8, 9)
  })
})

/**
 * Réécrit l'enregistrement stocké comme l'aurait fait une version antérieure du
 * mapper, en retirant des clés qui n'existaient pas encore.
 *
 * Passer par la base plutôt que par un objet fabriqué à la main est ce qui donne
 * sa valeur au test : c'est bien `recordToMeal` qui est éprouvé, sur une donnée
 * ayant réellement transité par IndexedDB.
 */
async function stripKeys(
  provider: DatabaseProvider,
  mealId: string,
  options: { readonly root?: readonly string[]; readonly entries?: readonly string[] },
): Promise<void> {
  const database = await provider.get()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('meals', 'readwrite')
    const store = transaction.objectStore('meals')
    const read = store.get(mealId)
    read.onsuccess = () => {
      const record = read.result as Record<string, unknown> & {
        entries?: Record<string, unknown>[]
      }
      for (const key of options.root ?? []) delete record[key]
      for (const entry of record.entries ?? []) {
        for (const key of options.entries ?? []) delete entry[key]
      }
      store.put(record)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
