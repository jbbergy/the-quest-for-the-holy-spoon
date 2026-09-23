import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { DB_NAME, DB_VERSION, INDEX, openHolySpoonDatabase, STORE } from '../database'

/** Ouvre la base telle que la version 1 l'avait créée, avec un repas dedans. */
async function legacyDatabase(): Promise<void> {
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
  const tx = db.transaction(STORE.meals, 'readwrite')
  tx.objectStore(STORE.meals).put({ id: 'meal-1', playerId: 'p', dayKey: '2026-09-22' })
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
