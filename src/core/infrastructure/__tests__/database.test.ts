import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { DB_NAME, DB_VERSION, INDEX, META_KEY, openHolySpoonDatabase, STORE } from '../database'

/** Ouvre la base telle que la version 1 l'avait créée, avec un repas dedans. */
async function legacyDatabase(
  seed: (tx: IDBTransaction) => void = () => undefined,
): Promise<void> {
  const open = indexedDB.open(DB_NAME, 1)
  open.onupgradeneeded = () => {
    const db = open.result
    db.createObjectStore(STORE.players, { keyPath: 'id' })
    const meals = db.createObjectStore(STORE.meals, { keyPath: 'id' })
    meals.createIndex(INDEX.mealsByPlayerDay, ['playerId', 'dayKey'])
    db.createObjectStore(STORE.foods, { keyPath: 'id' })
    db.createObjectStore(STORE.progress, { keyPath: 'playerId' })
    db.createObjectStore(STORE.meta, { keyPath: 'key' })
  }
  const db = await new Promise<IDBDatabase>((resolve) => (open.onsuccess = () => resolve(open.result)))
  const tx = db.transaction([STORE.meals, STORE.foods, STORE.meta], 'readwrite')
  tx.objectStore(STORE.meals).put({ id: 'meal-1', playerId: 'p', dayKey: '2026-09-22' })
  seed(tx)
  await new Promise((resolve) => (tx.oncomplete = resolve))
  db.close()
}

describe('Migrations de la base locale', () => {
  it('ajoute le journal de synchronisation sans toucher aux données', async () => {
    globalThis.indexedDB = new IDBFactory()
    await legacyDatabase()

    const db = await openHolySpoonDatabase()

    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames]).toContain(STORE.outbox)
    const tx = db.transaction([STORE.meals, STORE.outbox], 'readonly')
    expect([...tx.objectStore(STORE.outbox).indexNames]).toEqual([INDEX.outboxByRecord])
    const meal = await new Promise((resolve) => {
      const request = tx.objectStore(STORE.meals).get('meal-1')
      request.onsuccess = () => resolve(request.result)
    })
    expect(meal).toMatchObject({ id: 'meal-1' })
    db.close()
  })
})

describe('Migration v3 : auteur des aliments créés à la main', () => {
  const foodsAfterUpgrade = async (): Promise<Record<string, unknown>[]> => {
    const db = await openHolySpoonDatabase()
    const tx = db.transaction(STORE.foods, 'readonly')
    const foods = await new Promise<Record<string, unknown>[]>((resolve) => {
      const request = tx.objectStore(STORE.foods).getAll()
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[])
    })
    db.close()
    return foods
  }

  it('attribue les aliments perso au profil courant, pas les fiches de catalogue', async () => {
    globalThis.indexedDB = new IDBFactory()
    await legacyDatabase((tx) => {
      tx.objectStore(STORE.meta).put({ key: META_KEY.currentPlayerId, value: 'player-1' })
      tx.objectStore(STORE.foods).put({ id: 'food-1', source: 'USER', name: 'Houmous' })
      tx.objectStore(STORE.foods).put({ id: 'ciqual:1', source: 'CIQUAL', name: 'Riz' })
    })

    const foods = await foodsAfterUpgrade()

    expect(foods.find((food) => food.id === 'food-1')).toMatchObject({ ownerId: 'player-1', name: 'Houmous' })
    expect(foods.find((food) => food.id === 'ciqual:1')?.ownerId).toBeUndefined()
  })

  it('laisse sans auteur les aliments d’un appareil sans profil courant', async () => {
    globalThis.indexedDB = new IDBFactory()
    await legacyDatabase((tx) => {
      tx.objectStore(STORE.foods).put({ id: 'food-1', source: 'USER', name: 'Houmous' })
    })

    const [food] = await foodsAfterUpgrade()

    expect(food?.ownerId).toBeUndefined()
  })
})
