import { describe, expect, it, vi } from 'vitest'

import { EventBus } from '@/core/EventBus'
import { createEvent } from '@/core/events'
import { err, ok } from '@/core/result'

const event = createEvent('test.happened', { value: 1 })

describe('EventBus', () => {
  it('diffuse l’événement à ses abonnés', async () => {
    const bus = new EventBus()
    const handler = vi.fn(() => ok(undefined))
    bus.on('test.happened', handler)

    const report = await bus.publish(event)

    expect(handler).toHaveBeenCalledWith(event)
    expect(report).toEqual({ handled: 1, failures: [] })
  })

  it('n’appelle que les abonnés du bon nom', async () => {
    const bus = new EventBus()
    const wrong = vi.fn(() => ok(undefined))
    bus.on('autre.evenement', wrong)

    await bus.publish(event)

    expect(wrong).not.toHaveBeenCalled()
  })

  it('accepte plusieurs abonnés pour un même événement', async () => {
    const bus = new EventBus()
    const first = vi.fn(() => ok(undefined))
    const second = vi.fn(() => ok(undefined))
    bus.on('test.happened', first)
    bus.on('test.happened', second)

    const report = await bus.publish(event)

    expect(report.handled).toBe(2)
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })

  it('supporte les abonnés asynchrones', async () => {
    const bus = new EventBus()
    let done = false
    bus.on('test.happened', async () => {
      await Promise.resolve()
      done = true
      return ok(undefined)
    })

    await bus.publish(event)

    expect(done).toBe(true)
  })

  it('publier sans abonné est sans effet', async () => {
    expect(await new EventBus().publish(event)).toEqual({ handled: 0, failures: [] })
  })

  describe('isolation des échecs', () => {
    it('rapporte l’échec d’un abonné sans interrompre les autres', async () => {
      const bus = new EventBus()
      const healthy = vi.fn(() => ok(undefined))
      bus.on('test.happened', () => err(new Error('abonné en panne')))
      bus.on('test.happened', healthy)

      const report = await bus.publish(event)

      // L'échec de la gamification ne doit pas priver les autres abonnés de
      // l'événement, ni remonter comme une exception à l'émetteur.
      expect(healthy).toHaveBeenCalled()
      expect(report.failures).toHaveLength(1)
      expect(report.failures[0]?.message).toBe('abonné en panne')
    })

    it('rattrape une exception échappée d’un abonné mal écrit', async () => {
      const bus = new EventBus()
      bus.on('test.happened', () => {
        throw new Error('oubli de Result')
      })

      const report = await bus.publish(event)

      expect(report.failures).toHaveLength(1)
      expect(report.failures[0]?.message).toBe('oubli de Result')
    })

    it('rattrape aussi une valeur lancée qui n’est pas une Error', async () => {
      const bus = new EventBus()
      bus.on('test.happened', () => {
        throw 'chaîne nue'
      })

      const report = await bus.publish(event)

      expect(report.failures[0]).toBeInstanceOf(Error)
      expect(report.failures[0]?.message).toBe('chaîne nue')
    })

    it('rattrape le rejet d’un abonné asynchrone', async () => {
      const bus = new EventBus()
      bus.on('test.happened', async () => {
        throw new Error('rejet asynchrone')
      })

      const report = await bus.publish(event)

      expect(report.failures).toHaveLength(1)
    })
  })

  describe('désabonnement', () => {
    it('cesse de notifier après désabonnement', async () => {
      const bus = new EventBus()
      const handler = vi.fn(() => ok(undefined))

      bus.on('test.happened', handler)()
      const report = await bus.publish(event)

      expect(handler).not.toHaveBeenCalled()
      expect(report.handled).toBe(0)
    })

    it('ne retire que l’abonné visé', async () => {
      const bus = new EventBus()
      const kept = vi.fn(() => ok(undefined))
      const removed = vi.fn(() => ok(undefined))
      bus.on('test.happened', kept)
      bus.on('test.happened', removed)()

      await bus.publish(event)

      expect(kept).toHaveBeenCalled()
      expect(removed).not.toHaveBeenCalled()
    })

    it('se désabonner deux fois est sans effet', async () => {
      const bus = new EventBus()
      const unsubscribe = bus.on('test.happened', () => ok(undefined))

      unsubscribe()
      expect(() => unsubscribe()).not.toThrow()
    })

    it('clear retire tous les abonnements', async () => {
      const bus = new EventBus()
      bus.on('test.happened', () => ok(undefined))
      bus.on('autre.evenement', () => ok(undefined))

      bus.clear()

      expect((await bus.publish(event)).handled).toBe(0)
    })
  })
})
