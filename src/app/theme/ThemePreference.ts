/**
 * Persistance du thème choisi.
 *
 * `localStorage` et non IndexedDB, à l'inverse du reste de l'application : la
 * lecture doit être **synchrone**. Un accès asynchrone imposerait de peindre la
 * page avec le thème par défaut puis de la repeindre — le classique flash de
 * couleur, particulièrement désagréable quand on a choisi un thème sombre.
 *
 * C'est aussi une préférence d'appareil, pas une donnée du joueur : elle n'a
 * rien à faire dans la base métier ni dans une future synchronisation.
 */
export interface IThemePreference {
  read(): string | null
  write(themeId: string): void
  clear(): void
}

const STORAGE_KEY = 'holy-spoon.theme'

export class LocalThemePreference implements IThemePreference {
  read(): string | null {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    } catch {
      // Navigation privée ou stockage refusé : on retombe sur la préférence
      // système plutôt que d'empêcher l'application de démarrer.
      return null
    }
  }

  write(themeId: string): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, themeId)
    } catch {
      /* Le thème reste appliqué pour la session ; seule la mémoire est perdue. */
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      /* Rien à faire : il n'y avait rien à effacer. */
    }
  }
}

/** Préférence en mémoire, pour les tests et les contextes sans `localStorage`. */
export class InMemoryThemePreference implements IThemePreference {
  private value: string | null = null

  read(): string | null {
    return this.value
  }

  write(themeId: string): void {
    this.value = themeId
  }

  clear(): void {
    this.value = null
  }
}
