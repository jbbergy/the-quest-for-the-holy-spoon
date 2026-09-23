import { describe, expect, it } from 'vitest'

import { Email, EMAIL_MAX_LENGTH } from '../Email'

const valueOf = (raw: string): string => {
  const result = Email.create(raw)
  if (!result.ok) throw new Error(result.error.message)
  return result.value.value
}

describe('Email', () => {
  it('normalise la casse et les espaces', () => {
    expect(valueOf('  Camille.Martin@Example.FR ')).toBe('camille.martin@example.fr')
  })

  it('tient pour égales deux saisies de la même adresse', () => {
    const a = Email.create('camille@example.fr')
    const b = Email.create('CAMILLE@example.fr')
    if (!a.ok || !b.ok) throw new Error('adresses valides attendues')

    expect(a.value.equals(b.value)).toBe(true)
    expect(String(a.value)).toBe('camille@example.fr')
  })

  it('accepte les formes légitimes mais inhabituelles', () => {
    expect(valueOf('camille+courses@mail.example.co.uk')).toBe('camille+courses@mail.example.co.uk')
  })

  it.each(['', '   ', 'camille', 'camille@', '@example.fr', 'camille@example', 'ca mille@ex.fr', 'a@b..fr'])(
    'refuse « %s »',
    (raw) => {
      const result = Email.create(raw)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('INVALID_EMAIL')
    },
  )

  it('refuse une adresse trop longue', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH)
    expect(Email.create(`${local}@example.fr`).ok).toBe(false)
  })

  it('réhydrate une adresse sans la revalider', () => {
    expect(Email.reconstitute('camille@example.fr').value).toBe('camille@example.fr')
  })
})
