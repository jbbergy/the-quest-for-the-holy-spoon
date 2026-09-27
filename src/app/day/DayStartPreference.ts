/**
 * Heure à laquelle commence la journée de l'utilisateur.
 *
 * Préférence d'appareil, en `localStorage` comme le thème : la lecture doit
 * être synchrone, pour que l'accueil affiche d'emblée la bonne journée plutôt
 * que de basculer une fois IndexedDB ouverte.
 */
export interface IDayStartPreference {
  read(): number
  write(hour: number): void
}

/**
 * Heures proposées : toutes, de minuit à 23 h. Une soirée qui déborde n'a
 * besoin que des premières ; quelqu'un qui travaille de nuit et se lève à 15 h
 * a besoin des autres.
 */
export const DAY_START_HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour)

export function isDayStartHour(value: unknown): value is number {
  return typeof value === 'number' && DAY_START_HOURS.includes(value)
}

const STORAGE_KEY = 'holy-spoon.day-start'

export class LocalDayStartPreference implements IDayStartPreference {
  read(): number {
    try {
      const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 0)
      // Une valeur illisible ou hors des choix proposés retombe sur minuit.
      return isDayStartHour(stored) ? stored : 0
    } catch {
      return 0
    }
  }

  write(hour: number): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(hour))
    } catch {
      /* Le réglage reste appliqué pour la session ; seule la mémoire est perdue. */
    }
  }
}

/** Préférence en mémoire, pour les tests. */
export class InMemoryDayStartPreference implements IDayStartPreference {
  constructor(private hour = 0) {}

  read(): number {
    return this.hour
  }

  write(hour: number): void {
    this.hour = hour
  }
}
