import { describe, expect, it } from 'vitest'

import {
  LEVEL_CURVE_BASE,
  Level,
  MAX_LEVEL,
  xpThresholdForLevel,
} from '@/modules/gamification/domain/Level'

describe('xpThresholdForLevel', () => {
  it('place le niveau 1 à 0 XP', () => {
    expect(xpThresholdForLevel(1)).toBe(0)
    expect(xpThresholdForLevel(0)).toBe(0)
  })

  it('place le niveau 2 à la base de la courbe', () => {
    expect(xpThresholdForLevel(2)).toBe(LEVEL_CURVE_BASE)
  })

  it('croît strictement avec le niveau', () => {
    const thresholds = Array.from({ length: MAX_LEVEL }, (_, i) => xpThresholdForLevel(i + 1))

    for (let i = 1; i < thresholds.length; i += 1) {
      expect(thresholds[i]!).toBeGreaterThan(thresholds[i - 1]!)
    }
  })

  it('élargit progressivement l’écart entre paliers', () => {
    const gapEarly = xpThresholdForLevel(3) - xpThresholdForLevel(2)
    const gapLate = xpThresholdForLevel(21) - xpThresholdForLevel(20)

    expect(gapLate).toBeGreaterThan(gapEarly)
  })

  it('retourne des entiers', () => {
    for (let level = 1; level <= 20; level += 1) {
      expect(Number.isInteger(xpThresholdForLevel(level))).toBe(true)
    }
  })
})

describe('Level', () => {
  it('démarre au niveau 1 sans XP', () => {
    const level = Level.fromTotalXp(0)

    expect(level.value).toBe(1)
    expect(level.currentThreshold()).toBe(0)
    expect(level.xpIntoCurrentLevel()).toBe(0)
  })

  it('reste au niveau 1 juste avant le seuil suivant', () => {
    expect(Level.fromTotalXp(xpThresholdForLevel(2) - 1).value).toBe(1)
  })

  it('passe au niveau 2 pile au seuil', () => {
    expect(Level.fromTotalXp(xpThresholdForLevel(2)).value).toBe(2)
  })

  it.each([3, 5, 10, 25, 50])('atteint le niveau %i à son seuil exact', (target) => {
    expect(Level.fromTotalXp(xpThresholdForLevel(target)).value).toBe(target)
    expect(Level.fromTotalXp(xpThresholdForLevel(target) - 1).value).toBe(target - 1)
  })

  describe('progression dans le niveau', () => {
    it('mesure l’XP engrangée depuis l’entrée dans le niveau', () => {
      const threshold = xpThresholdForLevel(5)
      const level = Level.fromTotalXp(threshold + 30)

      expect(level.value).toBe(5)
      expect(level.xpIntoCurrentLevel()).toBe(30)
    })

    it('mesure l’XP restant avant le niveau suivant', () => {
      const threshold = xpThresholdForLevel(5)
      const level = Level.fromTotalXp(threshold)

      expect(level.xpToNextLevel()).toBe(xpThresholdForLevel(6) - threshold)
    })

    it('expose un ratio entre 0 et 1', () => {
      const start = Level.fromTotalXp(xpThresholdForLevel(4))
      const mid = Level.fromTotalXp(
        Math.floor((xpThresholdForLevel(4) + xpThresholdForLevel(5)) / 2),
      )

      expect(start.progressRatio()).toBe(0)
      expect(mid.progressRatio()).toBeGreaterThan(0)
      expect(mid.progressRatio()).toBeLessThan(1)
    })
  })

  describe('niveau maximum', () => {
    it('plafonne au niveau maximum même avec une XP énorme', () => {
      const level = Level.fromTotalXp(10_000_000)

      expect(level.value).toBe(MAX_LEVEL)
      expect(level.isMax).toBe(true)
    })

    it('n’annonce plus de seuil suivant au maximum', () => {
      const level = Level.fromTotalXp(10_000_000)

      expect(level.nextThreshold()).toBeNull()
      expect(level.xpToNextLevel()).toBeNull()
      expect(level.progressRatio()).toBe(1)
    })
  })

  it('compare par niveau, indépendamment de l’XP exacte', () => {
    const threshold = xpThresholdForLevel(3)

    expect(Level.fromTotalXp(threshold).equals(Level.fromTotalXp(threshold + 5))).toBe(true)
    expect(Level.fromTotalXp(0).equals(Level.fromTotalXp(threshold))).toBe(false)
  })
})
