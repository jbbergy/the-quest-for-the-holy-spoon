import { describe, expect, it } from 'vitest'

import type { ErrorView } from '@/core/errors'

import { tokenFromHash, useAccountFormErrors } from '../accountForm'

const errorOf = (code: string): ErrorView => ({ kind: 'domain', code, message: code })

describe('useAccountFormErrors', () => {
  it('place une adresse invalide sous le champ, pas dans le bandeau', () => {
    const { emailError, passwordError, formError } = useAccountFormErrors(() =>
      errorOf('INVALID_EMAIL'),
    )

    expect(emailError.value).toContain('Adresse e-mail invalide')
    expect(passwordError.value).toBeUndefined()
    expect(formError.value).toBeNull()
  })

  it('place un mot de passe trop court sous son champ', () => {
    const { passwordError, formError } = useAccountFormErrors(() => errorOf('WEAK_PASSWORD'))

    expect(passwordError.value).toContain('12 caractères minimum')
    expect(formError.value).toBeNull()
  })

  it('laisse les autres refus au bandeau', () => {
    const error = errorOf('INVALID_CREDENTIALS')
    const { emailError, formError } = useAccountFormErrors(() => error)

    expect(emailError.value).toBeUndefined()
    expect(formError.value).toBe(error)
  })
})

describe('tokenFromHash', () => {
  it('lit le jeton du fragment', () => {
    expect(tokenFromHash('#token=abc-123_XYZ')).toBe('abc-123_XYZ')
  })

  it.each(['', '#', '#token=', '#autre=1'])('renvoie null pour « %s »', (hash) => {
    expect(tokenFromHash(hash)).toBeNull()
  })
})
