/**
 * Niveau du joueur, dérivé du total d'XP.
 *
 * Courbe : le seuil d'entrée du niveau `n` vaut `round(BASE · (n − 1)^1.5)`. Le
 * niveau 1 démarre donc à 0 XP, et l'écart entre paliers s'élargit doucement —
 * assez pour que la progression reste lisible, sans mur en fin de courbe.
 *
 * `Level` est un Value Object purement dérivé : il ne se construit jamais seul,
 * toujours depuis un total d'XP, ce qui rend impossible une incohérence entre
 * le niveau affiché et l'XP réellement accumulée.
 */
export const LEVEL_CURVE_BASE = 100
export const MAX_LEVEL = 99

/** XP cumulée requise pour atteindre le niveau donné. */
export function xpThresholdForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.round(LEVEL_CURVE_BASE * Math.pow(level - 1, 1.5))
}

export class Level {
  private constructor(
    readonly value: number,
    private readonly totalXp: number,
  ) {}

  /** Seule fabrique : le niveau est une lecture du total d'XP, jamais une donnée saisie. */
  static fromTotalXp(totalXp: number): Level {
    let level = 1
    while (level < MAX_LEVEL && totalXp >= xpThresholdForLevel(level + 1)) {
      level += 1
    }
    return new Level(level, totalXp)
  }

  get isMax(): boolean {
    return this.value >= MAX_LEVEL
  }

  /** Seuil d'entrée du niveau courant. */
  currentThreshold(): number {
    return xpThresholdForLevel(this.value)
  }

  /** Seuil d'entrée du niveau suivant — `null` au niveau maximum. */
  nextThreshold(): number | null {
    return this.isMax ? null : xpThresholdForLevel(this.value + 1)
  }

  /** XP engrangée depuis l'entrée dans le niveau courant. */
  xpIntoCurrentLevel(): number {
    return this.totalXp - this.currentThreshold()
  }

  /** XP restant à gagner avant le niveau suivant — `null` au niveau maximum. */
  xpToNextLevel(): number | null {
    const next = this.nextThreshold()
    return next === null ? null : next - this.totalXp
  }

  /**
   * Avancement dans le niveau courant, entre 0 et 1 — la valeur que la jauge
   * animée consommera directement en phase 5.
   */
  progressRatio(): number {
    const next = this.nextThreshold()
    if (next === null) return 1
    const span = next - this.currentThreshold()
    return span === 0 ? 1 : this.xpIntoCurrentLevel() / span
  }

  equals(other: Level): boolean {
    return this.value === other.value
  }
}
