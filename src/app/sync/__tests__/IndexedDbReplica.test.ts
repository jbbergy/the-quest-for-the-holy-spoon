import { beforeEach, describe, expect, it } from 'vitest'

import { localChanges } from '@/core/infrastructure/changeJournal'
import { idFrom } from '@/core/identity'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'

import { OutboxMealOffers } from '@/modules/nutrition_inventory/infrastructure/OutboxMealOffers'

import { playerToRecord } from '@/modules/player_profile/infrastructure/records'

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

    // Le profil part avec ses besoins publiés, calculés à l'envoi.
    expect((await pendingChanges()).map((change) => [change.op, change.entity, change.id])).toEqual([
      ['upsert', 'player', 'player-1'],
      ['upsert', 'needs', 'player-1'],
      ['upsert', 'meal', meal.id],
      ['upsert', 'food', 'food-1'],
    ])
    expect(notified).toBe(3)
  })

  it('publie le nom et les besoins, jamais les mensurations', async () => {
    unwrap(await device.replica.start(STATE))
    unwrap(await device.players.save(playerOf('player-1')))

    const needs = (await pendingChanges()).find((change) => change.entity === 'needs')
    const payload = needs?.op === 'upsert' ? needs.payload : {}

    expect(Object.keys(payload).sort()).toEqual([
      'history',
      'id',
      'name',
      'playerId',
      'referenceNutrients',
      'targetCalories',
      'targetMacros',
    ])
    expect(payload.targetCalories).toBeGreaterThan(0)
  })

  it('ne journalise pas l’aliment d’un autre profil, ni un aliment sans auteur', async () => {
    unwrap(await device.replica.start(STATE))

    unwrap(await device.foods.save(customFoodOf('food-alex', FoodSource.USER, 'player-alex')))
    unwrap(
      await device.foods.save(
        FoodItem.reconstitute({
          id: idFrom('food-orphelin'),
          name: 'Orphelin',
          macrosPer100g: customFoodOf('x').macrosPer100g,
          source: FoodSource.USER,
          ownerId: null,
        }),
      ),
    )

    expect(unwrap(await device.replica.pendingCount())).toBe(0)
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

  it('journalise la suppression de ses aliments, pas celle d’une fiche de catalogue', async () => {
    const own = customFoodOf('food-1', FoodSource.USER, 'player-1')
    const cached = customFoodOf('off:1', FoodSource.OPEN_FOOD_FACTS)
    const foreign = customFoodOf('food-alex', FoodSource.USER, 'player-alex')
    unwrap(await device.foods.saveMany([own, cached, foreign]))
    unwrap(await device.replica.start(STATE))

    for (const food of [own, cached, foreign]) unwrap(await device.foods.delete(food.id))

    expect(await pendingChanges()).toEqual([{ op: 'delete', entity: 'food', id: own.id }])
    expect(unwrap(await device.foods.findById(cached.id))).toBeNull()
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
      'needs',
      'player',
    ])
  })

  it('n’inscrit que les aliments dont le profil est l’auteur', async () => {
    unwrap(await device.foods.save(customFoodOf('food-1')))
    unwrap(await device.foods.save(customFoodOf('food-alex', FoodSource.USER, 'player-alex')))
    unwrap(await device.replica.start(STATE))

    unwrap(await device.replica.enqueueAll('player-1'))

    const foods = (await pendingChanges()).filter((change) => change.entity === 'food')
    expect(foods.map((change) => change.id)).toEqual(['food-1'])
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

describe('Partage au sein du foyer', () => {
  const foreignFood = (id: string, ownerId = 'player-alex') => ({
    entity: 'food' as const,
    id,
    deleted: false as const,
    revision: 3,
    payload: { id, name: id, source: 'USER', ownerId, proteinG: 1, carbsG: 1, fatG: 1, tags: [], searchTokens: [id] },
  })

  it('reçoit les aliments des autres membres, et ignore les besoins publiés', async () => {
    unwrap(await device.replica.start(STATE))

    const changed = unwrap(
      await device.replica.applyRemote(
        [
          foreignFood('food-alex'),
          { entity: 'needs', id: 'player-1', deleted: false, revision: 4, payload: { id: 'player-1' } },
        ],
        4,
      ),
    )

    expect([...changed]).toEqual(['food'])
    expect(unwrap(await device.foods.findById(idFrom('food-alex')))?.ownerId).toBe('player-alex')
  })

  it('relit tout quand le foyer change, sans garder les aliments des anciens membres', async () => {
    unwrap(await device.players.save(playerOf('player-1')))
    unwrap(await device.foods.save(customFoodOf('food-1')))
    unwrap(await device.replica.start({ ...STATE, cursor: 12 }))
    unwrap(await device.replica.applyRemote([foreignFood('food-alex')], 12))
    unwrap(await device.replica.acknowledge(Number.MAX_SAFE_INTEGER))

    expect(unwrap(await device.replica.rebase('foyer-1:a,b'))).toBe(true)

    expect(unwrap(await device.replica.state())).toMatchObject({ cursor: 0, household: 'foyer-1:a,b' })
    expect(unwrap(await device.foods.findById(idFrom('food-alex')))).toBeNull()
    expect(unwrap(await device.foods.findById(idFrom('food-1')))).not.toBeNull()
    // Le profil repart, pour republier ses besoins auprès du nouveau foyer.
    expect((await pendingChanges()).map((change) => change.entity)).toEqual(['player', 'needs'])

    expect(unwrap(await device.replica.rebase('foyer-1:a,b'))).toBe(false)
  })

  it('ne bloque pas le profil encore en cours de téléchargement', async () => {
    // Connexion d'un compte depuis un appareil qui n'a pas son profil : le
    // foyer se charge pendant que le profil se télécharge.
    unwrap(await device.replica.start(STATE))

    expect(unwrap(await device.replica.rebase('foyer-1:a,b'))).toBe(true)
    expect(await pendingChanges()).toEqual([])

    unwrap(
      await device.replica.applyRemote(
        [{ entity: 'player', id: 'player-1', deleted: false, revision: 7, payload: { ...playerToRecord(playerOf('player-1')) } }],
        7,
      ),
    )
    expect(unwrap(await device.players.findById(idFrom('player-1')))).not.toBeNull()
  })

  it('n’a rien à relire sans compte connecté', async () => {
    expect(unwrap(await device.replica.rebase('foyer-1'))).toBe(false)
  })

  it('à la déconnexion, efface les aliments du compte et du foyer, garde ceux des autres profils locaux', async () => {
    unwrap(await device.players.save(playerOf('player-1')))
    unwrap(await device.players.save(playerOf('player-2')))
    unwrap(await device.foods.save(customFoodOf('food-1')))
    unwrap(await device.foods.save(customFoodOf('food-2', FoodSource.USER, 'player-2')))
    unwrap(await device.replica.start(STATE))
    unwrap(await device.replica.applyRemote([foreignFood('food-alex')], 5))

    unwrap(await device.replica.stop({ wipe: true }))

    const remaining = unwrap(await device.foods.findBySource(FoodSource.USER)).map((food) => food.id)
    expect(remaining).toEqual(['food-2'])
  })
})

describe('Repas prévu pour un autre membre', () => {
  it('part tel quel sans être stocké sur l’appareil', async () => {
    unwrap(await device.replica.start(STATE))
    const copy = mealOf('player-alex')
    let notified = 0
    const stop = localChanges.subscribe(() => (notified += 1))

    unwrap(await new OutboxMealOffers(device.databases).offer(copy))
    stop()

    const [change] = await pendingChanges()
    expect(change).toMatchObject({ op: 'upsert', entity: 'meal', id: copy.id })
    expect(change?.op === 'upsert' && change.payload.playerId).toBe('player-alex')
    expect(unwrap(await device.meals.findById(copy.id))).toBeNull()
    expect(notified).toBe(1)
  })

  it('est refusé sans compte connecté', async () => {
    const result = await new OutboxMealOffers(device.databases).offer(mealOf('player-alex'))
    expect(!result.ok && result.error.code).toBe('NOT_SYNCED')
  })
})
