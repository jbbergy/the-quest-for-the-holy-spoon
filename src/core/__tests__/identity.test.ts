import { describe, expect, it } from 'vitest'

import { idFrom, newId, type MealId, type PlayerId } from '@/core/identity'

describe('Identity', () => {
  it('génère des identifiants uniques', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId<'PlayerId'>()))

    expect(ids.size).toBe(100)
  })

  it('produit une chaîne directement sérialisable', () => {
    const id = newId<'MealId'>()

    expect(typeof id).toBe('string')
    expect(JSON.parse(JSON.stringify({ id }))).toEqual({ id })
  })

  it('remarque une chaîne existante pour la réhydratation', () => {
    const id: PlayerId = idFrom('p-1')

    expect(id).toBe('p-1')
  })

  it('empêche à la compilation de confondre deux familles d’identifiants', () => {
    const playerId: PlayerId = idFrom('p-1')
    // @ts-expect-error un PlayerId n'est pas assignable à un MealId
    const mealId: MealId = playerId

    expect(mealId).toBe('p-1')
  })
})
