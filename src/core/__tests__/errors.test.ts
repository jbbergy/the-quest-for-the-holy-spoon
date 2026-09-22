import { describe, expect, it } from 'vitest'

import {
  ApplicationError,
  DomainError,
  ExternalPayloadInvalidError,
  IncompatibleDietaryRestrictionError,
  InvalidPortionError,
  NotFoundError,
  RepositoryError,
  StorageQuotaExceededError,
  ValidationError,
} from '@/core/errors'

describe('Hiérarchie d’erreurs', () => {
  it('expose un discriminant `kind` par famille', () => {
    expect(new InvalidPortionError('x').kind).toBe('domain')
    expect(new NotFoundError('Meal', 'abc').kind).toBe('repository')
    expect(new ExternalPayloadInvalidError('Open Food Facts').kind).toBe('validation')
    expect(new ApplicationError('X', 'y').kind).toBe('application')
  })

  it('expose un code stable, destiné au mapping vers un message localisé', () => {
    expect(new InvalidPortionError('x').code).toBe('INVALID_PORTION')
    expect(new IncompatibleDietaryRestrictionError('x').code).toBe(
      'INCOMPATIBLE_DIETARY_RESTRICTION',
    )
    expect(new StorageQuotaExceededError().code).toBe('STORAGE_QUOTA_EXCEEDED')
  })

  it('reste une Error, avec un nom de classe exploitable en log', () => {
    const error = new InvalidPortionError('portion nulle')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DomainError)
    expect(error.name).toBe('InvalidPortionError')
    expect(error.message).toBe('portion nulle')
  })

  it('conserve la cause sous-jacente sans perdre le contexte', () => {
    const cause = new Error('QuotaExceededError')
    const wrapped = new StorageQuotaExceededError({ cause })

    expect(wrapped.cause).toBe(cause)
    expect(wrapped).toBeInstanceOf(RepositoryError)
  })

  it('compose un message lisible pour NotFoundError', () => {
    expect(new NotFoundError('Player', 'p-1').message).toBe('Player introuvable : p-1')
  })

  it('distingue validation et domaine', () => {
    const validation = new ExternalPayloadInvalidError('Open Food Facts')

    expect(validation).toBeInstanceOf(ValidationError)
    expect(validation).not.toBeInstanceOf(DomainError)
  })
})
