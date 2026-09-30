// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { currentLocale, setCurrentLocale, t } from '@/i18n'
import { InMemoryLocalePreference, LocalLocalePreference } from '@/i18n/LocalePreference'
import type { Locale } from '@/i18n/locale'
import { type LocaleTarget, useLocaleStore } from '@/i18n/useLocaleStore'

class SpyTarget implements LocaleTarget {
  applied: Locale[] = []

  setLocale(locale: Locale): void {
    this.applied.push(locale)
  }
}

let preference: InMemoryLocalePreference
let target: SpyTarget
let device: string[]

function store() {
  const locale = useLocaleStore()
  locale.configure({ preference, target, deviceLanguages: () => device })
  return locale
}

beforeEach(() => {
  preference = new InMemoryLocalePreference()
  target = new SpyTarget()
  device = ['fr-FR']
  setActivePinia(createPinia())
})

afterEach(() => setCurrentLocale('fr'))

describe('langue de l’application', () => {
  it('suit la langue de l’appareil tant qu’aucune langue n’est choisie', () => {
    device = ['en-US']
    const locale = store()

    expect(locale.initialize()).toBe('en')
    expect(locale.isAuto).toBe(true)
    expect(currentLocale()).toBe('en')
    expect(target.applied).toEqual(['en'])
    expect(t('shell.nav.settings')).toBe('Settings')
  })

  it('retombe sur l’anglais quand l’appareil parle une langue non prise en charge', () => {
    device = ['de-DE']

    expect(store().initialize()).toBe('en')
  })

  it('applique la langue choisie et la mémorise', () => {
    const locale = store()
    locale.initialize()

    locale.select('en')

    expect(locale.current).toBe('en')
    expect(locale.preference).toBe('en')
    expect(preference.read()).toBe('en')
    expect(t('shell.nav.settings')).toBe('Settings')
  })

  it('ne suit plus l’appareil une fois choisie', () => {
    const locale = store()
    locale.initialize()
    locale.select('fr')

    device = ['en-GB']
    locale.followDevice()

    expect(locale.current).toBe('fr')
    expect(t('shell.nav.settings')).toBe('Réglages')
  })

  it('suit de nouveau l’appareil quand on repasse à « automatique »', () => {
    device = ['en-GB']
    const locale = store()
    locale.initialize()
    locale.select('fr')
    expect(locale.current).toBe('fr')

    locale.select('auto')

    expect(locale.current).toBe('en')
    expect(preference.read()).toBeNull()
    expect(locale.isAuto).toBe(true)
  })

  it('suit l’appareil quand celui-ci change de langue en cours d’usage', () => {
    const locale = store()
    locale.initialize()
    expect(locale.current).toBe('fr')

    device = ['en-US']
    locale.followDevice()

    expect(locale.current).toBe('en')
  })

  it('relit le choix mémorisé au démarrage, même si l’appareil parle une autre langue', () => {
    preference.write('en')
    device = ['fr-FR']
    const locale = store()

    expect(locale.initialize()).toBe('en')
    expect(locale.isAuto).toBe(false)
  })
})

describe('LocalLocalePreference', () => {
  beforeEach(() => globalThis.localStorage.clear())

  it('mémorise le choix dans l’appareil', () => {
    const local = new LocalLocalePreference()
    expect(local.read()).toBeNull()

    local.write('en')
    expect(new LocalLocalePreference().read()).toBe('en')

    local.clear()
    expect(local.read()).toBeNull()
  })

  it('ignore une valeur qui n’est plus une langue prise en charge', () => {
    globalThis.localStorage.setItem('holy-spoon.locale', 'klingon')

    expect(new LocalLocalePreference().read()).toBeNull()
  })
})
