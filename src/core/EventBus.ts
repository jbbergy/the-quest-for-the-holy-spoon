import type { DomainEvent } from './events'
import type { Result } from './result'

/**
 * Bus d'événements applicatifs.
 *
 * C'est le seul canal par lequel un contexte réagit à ce qui se passe dans un
 * autre. `gamification` s'abonne à `nutrition_inventory.meal_logged` sans jamais
 * importer `Meal` : il ne reçoit qu'un payload sérialisable.
 *
 * Les abonnés retournent un `Result` plutôt que de lever. Un échec d'abonné ne
 * doit **jamais** faire échouer l'action qui a émis l'événement : si
 * l'attribution d'XP échoue, le repas reste enregistré. `publish` collecte donc
 * les échecs et les rend à l'appelant, qui décide quoi en faire — généralement
 * les signaler sans bloquer.
 */
export type EventHandler<TEvent extends DomainEvent> = (
  event: TEvent,
) => Promise<Result<void, Error>> | Result<void, Error>

export interface PublishReport {
  readonly handled: number
  readonly failures: readonly Error[]
}

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<never>>>()

  /** S'abonne à un nom d'événement. Retourne la fonction de désabonnement. */
  on<TEvent extends DomainEvent>(
    name: TEvent['name'],
    handler: EventHandler<TEvent>,
  ): () => void {
    const existing = this.handlers.get(name) ?? new Set()
    existing.add(handler as EventHandler<never>)
    this.handlers.set(name, existing)

    return () => {
      existing.delete(handler as EventHandler<never>)
    }
  }

  /**
   * Diffuse un événement à tous ses abonnés.
   *
   * Les abonnés sont exécutés **en parallèle et jusqu'au bout** : l'échec de
   * l'un ne doit pas priver les autres de l'événement. Une exception échappée
   * d'un abonné mal écrit est rattrapée ici et comptée comme un échec, pour que
   * le bus ne devienne jamais un chemin de propagation d'exceptions.
   */
  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<PublishReport> {
    const handlers = [...(this.handlers.get(event.name) ?? [])] as EventHandler<TEvent>[]

    const outcomes = await Promise.all(
      handlers.map(async (handler): Promise<Error | null> => {
        try {
          const result = await handler(event)
          return result.ok ? null : result.error
        } catch (cause) {
          return cause instanceof Error ? cause : new Error(String(cause))
        }
      }),
    )

    return {
      handled: handlers.length,
      failures: outcomes.filter((outcome): outcome is Error => outcome !== null),
    }
  }

  /** Retire tous les abonnements. Utile au démontage et entre deux tests. */
  clear(): void {
    this.handlers.clear()
  }
}
