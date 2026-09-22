import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalThemePreference } from '@/app/theme/ThemePreference'

/** Remplace `localStorage` par un double, restitué après chaque test. */
function stubStorage(impl: Partial<Storage>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: impl,
    configurable: true,
    writable: true,
  })
}

const workingStorage = (): Partial<Storage> => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Navigation privée ou stockage refusé : l'accès lève au lieu de renvoyer null. */
const throwingStorage = (): Partial<Storage> => ({
  getItem: () => {
    throw new DOMException('refusé', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('refusé', 'SecurityError')
  },
  removeItem: () => {
    throw new DOMException('refusé', 'SecurityError')
  },
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
  vi.restoreAllMocks()
})

describe('LocalThemePreference', () => {
  it('mémorise et relit le choix', () => {
    stubStorage(workingStorage())
    const preference = new LocalThemePreference()

    expect(preference.read()).toBeNull()
    preference.write('crepuscule')
    expect(preference.read()).toBe('crepuscule')
  })

  it('efface le choix', () => {
    stubStorage(workingStorage())
    const preference = new LocalThemePreference()
    preference.write('crepuscule')

    preference.clear()

    expect(preference.read()).toBeNull()
  })

  it('retombe sur null quand le stockage est refusé', () => {
    // C'est le cas de la navigation privée : l'accès lève, et l'application
    // doit démarrer sur la préférence système plutôt que d'échouer.
    stubStorage(throwingStorage())

    expect(new LocalThemePreference().read()).toBeNull()
  })

  it('n’échoue pas à l’écriture quand le stockage est refusé', () => {
    stubStorage(throwingStorage())

    // Le thème reste appliqué pour la session ; seule la mémoire est perdue.
    expect(() => new LocalThemePreference().write('aube')).not.toThrow()
    expect(() => new LocalThemePreference().clear()).not.toThrow()
  })

  it('fonctionne en l’absence totale de localStorage', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    const preference = new LocalThemePreference()

    expect(preference.read()).toBeNull()
    expect(() => preference.write('aube')).not.toThrow()
    expect(() => preference.clear()).not.toThrow()
  })
})
