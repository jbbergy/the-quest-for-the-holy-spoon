import { isLocale, type Locale } from './locale'

/**
 * Persistance de la langue **choisie** dans les réglages.
 *
 * Rien n'est mémorisé tant que la personne laisse la langue automatique :
 * c'est cette absence qui fait suivre l'appareil. Même raison que pour le
 * thème d'utiliser `localStorage` — la lecture doit être synchrone, sans quoi
 * la première image serait peinte dans la mauvaise langue — et même statut :
 * une préférence d'appareil, hors de la base métier et de la synchronisation.
 */
export interface ILocalePreference {
  /** La langue choisie, ou `null` si la personne n'en a pas choisi. */
  read(): Locale | null
  write(locale: Locale): void
  clear(): void
}

const STORAGE_KEY = 'holy-spoon.locale'

export class LocalLocalePreference implements ILocalePreference {
  read(): Locale | null {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
      // Une langue retirée de l'application ne doit pas bloquer le démarrage.
      return isLocale(stored) ? stored : null
    } catch {
      return null
    }
  }

  write(locale: Locale): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, locale)
    } catch {
      /* La langue reste appliquée pour la session ; seule la mémoire est perdue. */
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      /* Rien à effacer. */
    }
  }
}

/** Préférence en mémoire, pour les tests et les contextes sans `localStorage`. */
export class InMemoryLocalePreference implements ILocalePreference {
  private value: Locale | null = null

  read(): Locale | null {
    return this.value
  }

  write(locale: Locale): void {
    this.value = locale
  }

  clear(): void {
    this.value = null
  }
}
