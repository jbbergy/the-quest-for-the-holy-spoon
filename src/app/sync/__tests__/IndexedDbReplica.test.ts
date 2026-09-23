import { beforeEach, describe, expect, it } from 'vitest'

import { localChanges } from '@/core/infrastructure/changeJournal'
import { FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'

import { createDevice, customFoodOf, type Device, mealOf, playerOf, unwrap } from './fixtures'

const STATE = { accountId: 'account-1', playerId: 'player-1', cursor: 0 }

let device: Device

beforeEach(() => {
  device = createDevice()
})

const pendingChanges = async () => unwrap(await device.replica.pending(100))?.changes ?? []

describe('Journal des modifications', () => {
  it('ne journalise rien sans compte connecté', async () => {
    unwrap(await device.players.save(playerOf('player-1')))
    unwrap(await device.meals.save(mealOf('player-1')))

    expect(unwrap(await device.replica.pendingCount())).toBe(0)
  })

  it('journalise le profil, les repas et les aliments créés à la main du compte', async () => {
    unwrap(await device.replica.start(STATE))
    let notified = 0
    const stop = localChanges.subscribe(() => (notified += 1))

    unwrap(await device.players.save(playerOf('player-1')))
    const meal = mealOf('player-1')
    unwrap(await device.meals.save(meal))
    unwrap(await device.foods.save(customFoodOf('food-1')))
    stop()

    expect((await pendingChanges()).map((change) => [change.op, change.entity, change.id])).toEqual([
      ['upsert', 'player', 'player-1'],
      ['upsert', 'meal', meal.id],
      ['upsert', 'food', 'food-1'],
    ])
    expect(notified).toBe(3)
  })

  it('ignore les autres profils de l’appareil et les fiches de catalogue', async () => {
    unwrap(await device.replica.start(STATE))

    unwrap(await device.players.save(playerOf('player-2')))
    unwrap(await device.meals.save(mealOf('player-2')))
    unwrap(await device.foods.save(customFoodOf('ciqual:1', FoodSource.CIQUAL)))

    expect(unwrap(await device.replica.pendingCount())).toBe(0)
  })

  it('journalise une suppression de repas, pas celle d’un autre profil', async () => {
    const own = mealOf('player-1')
    const other = mealOf('player-2')
    unwrap(await device.meals.save(own))
    unwrap(await device.meals.save(other))
    unwrap(await device.replica.start(STATE))

    unwrap(await device.meals.delete(own.id))
    unwrap(await device.meals.delete(other.id))

    expect(await pendingChanges()).toEqual([{ op: 'delete', entity: 'meal', id: own.id }])
  })

  it('n’envoie que la dernière version d’un enregistrement modifié plusieurs fois', async () => {
    unwrap(await device.replica.start(STATE))
    const meal = mealOf('player-1', 100)
    unwrap(await device.meals.save(meal))
    unwrap(await device.meals.save(mealOf('player-1', 250, meal.id)))

    const changes = await pendingChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ op: 'upsert', payload: { id: meal.id } })
    expect(JSON.stringify(changes[0])).toContain('250')
  })

  it('envoie une suppression pour un enregistrement disparu entre-temps', async () => {
    unwrap(await device.replica.start(STATE))
    const meal = mealOf('player-1')
    unwrap(await device.meals.save(meal))
    unwrap(await device.meals.delete(meal.id))

    expect(await pendingChanges()).toEqual([{ op: 'delete', entity: 'meal', id: meal.id }])
  })

  it('n’acquitte que ce qui a été envoyé', async () => {
    unwrap(await device.replica.start(STATE))
    unwrap(await device.meals.save(mealOf('player-1')))
    const batch = unwrap(await device.replica.pending(100))!
    unwrap(await device.meals.save(mealOf('player-1')))

    unwrap(await device.replica.acknowledge(batch.lastSeq))

    expect(unwrap(await device.replica.pendingCount())).toBe(1)
  })
})

describe('Premier envoi', () => {
  it('inscrit au journal tout ce qui appartient au profil', async () => {
    unwrap(await device.players.save(playerOf('player-1')))
    unwrap(await device.meals.save(mealOf('player-1')))
    unwrap(await device.meals.save(mealOf('player-2')))
    unwrap(await device.foods.save(customFoodOf('food-1')))
    unwrap(await device.replica.start(STATE))

    unwrap(await device.replica.enqueueAll('player-1'))

    expect((await pendingChanges()).map((change) => change.entity).sort()).toEqual([
      'food',
      'meal',
      'player',
    ])
  })
})

describe('Modifications distantes', () => {
  const remoteMeal = (id: string, grams: number) => ({
    entity: 'meal' as const,
    id,
    deleted: false as const,
    revision: 1,
    payload: JSON.parse(JSON.stringify(mealOf('player-1', grams, id))) as Record<string, unknown>,
  })

  it('applique les enregistrements reçus et avance le curseur', async () => {
    unwrap(await device.replica.start(STATE))
    const meal = mealOf('player-1', 120)
    // Enregistrement tel que stocké par un autre appareil.
    const other = createDevice()
    unwrap(await other.meals.save(meal))

    const stored = await readStored(other, meal.id)
    const changed = unwrap(
      await device.replica.applyRemote(
        [{ entity: 'meal', id: meal.id, deleted: false, revision: 7, payload: stored }],
        7,
      ),
    )

    expect([...changed]).toEqual(['meal'])
    expect(unwrap(await device.meals.findById(meal.id))?.id).toBe(meal.id)
    expect(unwrap(await device.replica.state())?.cursor).toBe(7)
    // Appliquer une modification distante ne la renvoie pas au serveur.
    expect(unwrap(await device.replica.pendingCount())).toBe(0)
  })

  it('n’écrase pas une modification locale pas encore envoyée', async () => {
    unwrap(await device.replica.start(STATE))
    const meal = mealOf('player-1', 300)
    unwrap(await device.meals.save(meal))
    const local = await readStored(device, meal.id)

    unwrap(
      await device.replica.applyRemote(
        [{ entity: 'meal', id: meal.id, deleted: true, revision: 3 }],
        3,
      ),
    )

    expect(await readStored(device, meal.id)).toEqual(local)
  })

  it('ne signale rien pour le simple retour de ses propres envois', async () => {
    unwrap(await device.replica.start(STATE))
    const meal = mealOf('player-1')
    unwrap(await device.meals.save(meal))
    unwrap(await device.replica.acknowledge(unwrap(await device.replica.pending(10))!.lastSeq))

    const echo = await readStored(device, meal.id)
    const changed = unwrap(
      await device.replica.applyRemote(
        [{ entity: 'meal', id: meal.id, deleted: false, revision: 2, payload: { ...echo } }],
        2,
      ),
    )

    expect(changed.size).toBe(0)
  })

  it('applique une suppression distante', async () => {
    const meal = mealOf('player-1')
    unwrap(await device.meals.save(meal))
    unwrap(await device.replica.start(STATE))

    const changed = unwrap(
      await device.replica.applyRemote(
        [
          { entity: 'meal', id: meal.id, deleted: true, revision: 4 },
          { entity: 'meal', id: 'inconnu', deleted: true, revision: 5 },
        ],
        5,
      ),
    )

    expect([...changed]).toEqual(['meal'])
    expect(unwrap(await device.meals.findById(meal.id))).toBeNull()
  })

  it('ignore des modifications arrivées après la déconnexion', async () => {
    const changed = unwrap(await device.replica.applyRemote([remoteMeal('meal-x', 100)], 9))

    expect(changed.size).toBe(0)
    expect(unwrap(await device.meals.findById(mealOf('player-1', 1, 'meal-x').id))).toBeNull()
  })
})

describe('Fin de synchronisation', () => {
  beforeEach(async () => {
    unwrap(await device.players.save(playerOf('player-local')))
    unwrap(await device.players.save(playerOf('player-1')))
    unwrap(await device.meals.save(mealOf('player-1')))
    unwrap(await device.meals.save(mealOf('player-local')))
    unwrap(await device.replica.start(STATE))
    unwrap(await device.meals.save(mealOf('player-1')))
  })

  it('efface la copie locale du compte et revient au profil local restant', async () => {
    unwrap(await device.replica.stop({ wipe: true }))

    expect(unwrap(await device.players.findById(playerOf('player-1').id))).toBeNull()
    expect(unwrap(await device.meals.findAllByPlayer(playerOf('player-1').id))).toEqual([])
    expect(unwrap(await device.meals.findAllByPlayer(playerOf('player-local').id))).toHaveLength(1)
    expect(unwrap(await device.players.findCurrent())?.id).toBe('player-local')
    expect(unwrap(await device.replica.state())).toBeNull()
    expect(unwrap(await device.replica.pendingCount())).toBe(0)
  })

  it('garde les données quand on ne demande pas l’effacement', async () => {
    unwrap(await device.replica.stop({ wipe: false }))

    expect(unwrap(await device.meals.findAllByPlayer(playerOf('player-1').id))).toHaveLength(2)
    expect(unwrap(await device.replica.state())).toBeNull()
  })

  it('désigne le profil du compte comme courant', async () => {
    unwrap(await device.replica.makeCurrent('player-local'))
    expect(unwrap(await device.players.findCurrent())?.id).toBe('player-local')
  })
})

/** Enregistrement brut, tel qu'IndexedDB le conserve. */
async function readStored(target: Device, id: string): Promise<Record<string, unknown>> {
  const db = await target.databases.get()
  const tx = db.transaction('meals', 'readonly')
  return new Promise((resolve) => {
    const request = tx.objectStore('meals').get(id)
    request.onsuccess = () => resolve(request.result as Record<string, unknown>)
  })
}
