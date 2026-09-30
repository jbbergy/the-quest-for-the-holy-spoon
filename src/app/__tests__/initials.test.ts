import { describe, expect, it } from 'vitest'

import { initials } from '@/app/initials'

describe('initials', () => {
  it('prend la première lettre des deux premiers mots', () => {
    expect(initials('Jean-Baptiste')).toBe('JB')
    expect(initials('marie claire dupont')).toBe('MC')
  })

  it('garde une seule lettre pour un seul mot', () => {
    expect(initials('  Camille ')).toBe('C')
  })

  it('ne coupe pas un caractère composé', () => {
    expect(initials('É́lodie')).toBe('É́')
    expect(initials('🍓 Fraise')).toBe('🍓F')
  })

  it('rend une chaîne vide pour un nom vide', () => {
    expect(initials('   ')).toBe('')
  })
})
