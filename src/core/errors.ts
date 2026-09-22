/**
 * Hiérarchie d'erreurs typées transportées par `Result`.
 *
 * Chaque erreur porte un discriminant `kind` et un `code` stable. La présentation
 * mappe ce couple vers un message localisé : jamais `instanceof`, qui devient
 * fragile dès qu'une classe traverse deux bundles, et jamais le `message` brut,
 * qui est destiné au développeur et non à l'utilisateur.
 */
export type ErrorKind = 'domain' | 'repository' | 'validation' | 'application' | 'remote'

export abstract class BaseError extends Error {
  abstract readonly kind: ErrorKind

  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions)
    this.name = new.target.name
  }
}

/** Règle métier violée. Levée (retournée) par les Entités et Value Objects. */
export class DomainError extends BaseError {
  readonly kind = 'domain' as const
}

/** Échec technique de persistance, converti par l'infrastructure. */
export class RepositoryError extends BaseError {
  readonly kind = 'repository' as const
}

/** Donnée externe non conforme, détectée par la couche anti-corruption. */
export class ValidationError extends BaseError {
  readonly kind = 'validation' as const
}

/** Échec d'orchestration au niveau Use Case, enveloppant sa cause. */
export class ApplicationError extends BaseError {
  readonly kind = 'application' as const
}

/** Source distante injoignable, en panne ou trop lente. */
export class RemoteError extends BaseError {
  readonly kind = 'remote' as const
}

export class RemoteUnavailableError extends RemoteError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('REMOTE_UNAVAILABLE', message, options)
  }
}

/**
 * Projection d'une erreur pour la couche présentation.
 *
 * Les stores exposent cette forme plutôt qu'une chaîne : les composants Vue
 * mappent le couple `kind`/`code` vers un message localisé, et le `message`
 * d'origine reste destiné au développeur et aux journaux.
 */
export interface ErrorView {
  readonly kind: ErrorKind
  readonly code: string
  readonly message: string
}

export function toErrorView(error: BaseError): ErrorView {
  return { kind: error.kind, code: error.code, message: error.message }
}

// --- Erreurs de domaine concrètes -------------------------------------------

export class InvalidPortionError extends DomainError {
  constructor(message: string) {
    super('INVALID_PORTION', message)
  }
}

export class InvalidMacrosError extends DomainError {
  constructor(message: string) {
    super('INVALID_MACROS', message)
  }
}

export class InvalidNutrientsError extends DomainError {
  constructor(message: string) {
    super('INVALID_NUTRIENTS', message)
  }
}

export class InvalidMeasurementError extends DomainError {
  constructor(message: string) {
    super('INVALID_MEASUREMENT', message)
  }
}

export class IncompatibleDietaryRestrictionError extends DomainError {
  constructor(message: string) {
    super('INCOMPATIBLE_DIETARY_RESTRICTION', message)
  }
}

export class InvalidXpAmountError extends DomainError {
  constructor(message: string) {
    super('INVALID_XP_AMOUNT', message)
  }
}

export class InvalidFoodItemError extends DomainError {
  constructor(message: string) {
    super('INVALID_FOOD_ITEM', message)
  }
}

export class InvalidMealError extends DomainError {
  constructor(message: string) {
    super('INVALID_MEAL', message)
  }
}

export class InvalidPlayerError extends DomainError {
  constructor(message: string) {
    super('INVALID_PLAYER', message)
  }
}

export class InvalidNutritionalNeedsError extends DomainError {
  constructor(message: string) {
    super('INVALID_NUTRITIONAL_NEEDS', message)
  }
}

// --- Erreurs de persistance concrètes ---------------------------------------

export class NotFoundError extends RepositoryError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} introuvable : ${id}`)
  }
}

export class StorageQuotaExceededError extends RepositoryError {
  constructor(options?: { cause?: unknown }) {
    super('STORAGE_QUOTA_EXCEEDED', 'Quota de stockage local dépassé.', options)
  }
}

export class StorageUnavailableError extends RepositoryError {
  constructor(options?: { cause?: unknown }) {
    super('STORAGE_UNAVAILABLE', 'Le stockage local est indisponible.', options)
  }
}

// --- Erreurs de validation concrètes ----------------------------------------

export class ExternalPayloadInvalidError extends ValidationError {
  constructor(source: string, options?: { cause?: unknown }) {
    super('EXTERNAL_PAYLOAD_INVALID', `Réponse non conforme de ${source}.`, options)
  }
}
