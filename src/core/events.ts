/**
 * Événements de domaine — de simples objets de données.
 *
 * C'est précisément ce qui permet à `gamification` de réagir à un repas enregistré
 * sans rien savoir de l'entité `Meal` : il ne reçoit qu'un payload sérialisable,
 * défini dans la façade `application/` du module émetteur.
 */
export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly name: TName
  readonly occurredAt: Date
  readonly payload: TPayload
}

export function createEvent<TName extends string, TPayload>(
  name: TName,
  payload: TPayload,
  occurredAt: Date = new Date(),
): DomainEvent<TName, TPayload> {
  return { name, occurredAt, payload }
}

export function isEvent<TName extends string>(
  event: DomainEvent,
  name: TName,
): event is DomainEvent<TName, unknown> {
  return event.name === name
}
