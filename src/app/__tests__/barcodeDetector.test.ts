import { describe, expect, it } from 'vitest'

import { isValidProductCode, ReadingConfirmation } from '@/app/barcode/barcodeDetector'

describe('isValidProductCode', () => {
  it('accepte un EAN-13, un EAN-8 et un UPC-A à la clé juste', () => {
    expect(isValidProductCode('3017620422003')).toBe(true)
    expect(isValidProductCode('96385074')).toBe(true)
    expect(isValidProductCode('036000291452')).toBe(true)
  })

  it('refuse une clé fausse, une longueur inconnue ou autre chose que des chiffres', () => {
    expect(isValidProductCode('3017620422004')).toBe(false)
    expect(isValidProductCode('30176204220')).toBe(false)
    expect(isValidProductCode('30176204220a3')).toBe(false)
  })
})

describe('ReadingConfirmation', () => {
  it('ne rend un code qu’après deux lectures identiques', () => {
    const confirmation = new ReadingConfirmation()

    expect(confirmation.see(['3017620422003'])).toBeNull()
    expect(confirmation.see(['3017620422003'])).toBe('3017620422003')
  })

  it('garde le compte à travers une image sans code', () => {
    const confirmation = new ReadingConfirmation()

    confirmation.see(['3017620422003'])
    expect(confirmation.see([])).toBeNull()
    expect(confirmation.see(['3017620422003'])).toBe('3017620422003')
  })

  it('repart de zéro quand un autre numéro est lu', () => {
    const confirmation = new ReadingConfirmation()

    confirmation.see(['3017620422003'])
    expect(confirmation.see(['96385074'])).toBeNull()
    expect(confirmation.see(['3017620422003'])).toBeNull()
  })

  it('ignore les numéros à la clé fausse', () => {
    const confirmation = new ReadingConfirmation()

    confirmation.see(['3017620422004'])
    expect(confirmation.see(['3017620422004'])).toBeNull()
  })
})
