import { describe, expect, it } from 'vitest'

import {
  checkPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
} from '../PasswordPolicy'

describe('PasswordPolicy', () => {
  it('accepte une phrase de passe sans chiffre ni majuscule', () => {
    expect(checkPassword('cuillere en bois dorée').ok).toBe(true)
  })

  it('refuse un mot de passe trop court, quelle que soit sa composition', () => {
    const result = checkPassword('Aa1!Aa1!Aa1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('WEAK_PASSWORD')
  })

  it('compte les caractères, pas les unités UTF-16', () => {
    // « é » décomposé (e + accent combinant) compte pour un seul caractère.
    expect(passwordLength('é')).toBe(1)
    expect(passwordLength('🥄🥄')).toBe(2)
  })

  it('borne la longueur maximale', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH)).ok).toBe(true)
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH)).ok).toBe(true)
    expect(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1)).ok).toBe(false)
  })
})
