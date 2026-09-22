/**
 * `Result<T, E>` — le canal unique des erreurs *attendues et gérables* du projet.
 *
 * Les bugs et les erreurs inattendues restent des `throw` classiques, remontés au
 * gestionnaire global de Vue. Tout le reste — validation d'un Value Object, absence
 * d'un agrégat en base, payload externe malformé — traverse les couches sous cette
 * forme, ce qui rend chaque signature explicite sur ce qui peut échouer.
 *
 * Aucun `unwrap()` qui jette n'est fourni : son existence suffirait à ce qu'il soit
 * employé partout, et le bénéfice du pattern disparaîtrait.
 */
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok

/** Transforme la valeur d'un succès, laisse l'échec intact. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Transforme l'erreur d'un échec, laisse le succès intact. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error))
}

/** Enchaîne une opération qui peut elle-même échouer, sans imbriquer les `Result`. */
export function flatMap<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result
}

/** Valeur de repli — le seul moyen de sortir d'un `Result` sans traiter l'erreur. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

/**
 * Agrège N `Result` en un `Result` de liste, court-circuitant au premier échec.
 * Indispensable pour construire un agrégat à partir d'une collection de Value
 * Objects sans dépiler manuellement à chaque itération.
 */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}
