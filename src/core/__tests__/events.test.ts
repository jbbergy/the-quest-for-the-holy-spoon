import { describe, expect, it } from 'vitest'

import { createEvent, isEvent } from '@/core/events'

describe('DomainEvent', () => {
  it('horodate l’événement à sa création', () => {
    const at = new Date('2026-01-15T12:30:00.000Z')
    const event = createEvent('meal.logged', { mealId: 'm-1' }, at)

    expect(event.name).toBe('meal.logged')
    expect(event.occurredAt).toBe(at)
    expect(event.payload).toEqual({ mealId: 'm-1' })
  })

  it('horodate à maintenant par défaut', () => {
    const before = Date.now()
    const event = createEvent('meal.logged', {})

    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('reconnaît un événement par son nom', () => {
    const event = createEvent('meal.logged', {})

    expect(isEvent(event, 'meal.logged')).toBe(true)
    expect(isEvent(event, 'player.levelled_up')).toBe(false)
  })
})
