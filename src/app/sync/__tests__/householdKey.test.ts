import { describe, expect, it } from 'vitest'

import { householdIdOfKey } from '../householdKey'

describe('householdIdOfKey', () => {
  it('extrait le foyer de l’empreinte', () => {
    expect(householdIdOfKey('foyer-1:a,b')).toBe('foyer-1')
    expect(householdIdOfKey('foyer-1')).toBe('foyer-1')
  })

  it.each([null, undefined, '', ':a'])('ne trouve aucun foyer dans %j', (key) => {
    expect(householdIdOfKey(key)).toBeNull()
  })
})
