import { describe, expect, it } from 'vitest'

import { AUTO_LOCALE, DEVICE_FALLBACK_LOCALE, isLocale, matchDeviceLocale, resolveLocale } from '../locale'

describe('matchDeviceLocale', () => {
  it.each([
    [['fr-FR'], 'fr'],
    [['fr-CA', 'en-US'], 'fr'],
    [['en-US', 'fr-FR'], 'en'],
    [['en'], 'en'],
    [['EN_gb'], 'en'],
  ])('%p → %p', (languages, expected) => {
    expect(matchDeviceLocale(languages)).toBe(expected)
  })

  it('respecte l’ordre de préférence et saute les langues inconnues', () => {
    expect(matchDeviceLocale(['de-DE', 'en-US', 'fr-FR'])).toBe('en')
  })

  it('retombe sur l’anglais quand aucune langue n’est prise en charge, ou inconnue', () => {
    expect(DEVICE_FALLBACK_LOCALE).toBe('en')
    expect(matchDeviceLocale(['de-DE', 'ja'])).toBe('en')
    expect(matchDeviceLocale([])).toBe('en')
    expect(matchDeviceLocale([''])).toBe('en')
  })
})

describe('resolveLocale', () => {
  it('suit l’appareil tant que rien n’est choisi', () => {
    expect(resolveLocale(AUTO_LOCALE, ['en-GB'])).toBe('en')
    expect(resolveLocale(AUTO_LOCALE, ['fr-FR'])).toBe('fr')
  })

  it('ne suit plus l’appareil dès qu’une langue est choisie', () => {
    expect(resolveLocale('fr', ['en-GB'])).toBe('fr')
    expect(resolveLocale('en', ['fr-FR'])).toBe('en')
  })
})

describe('isLocale', () => {
  it('ne reconnaît que les langues prises en charge', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('auto')).toBe(false)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})
