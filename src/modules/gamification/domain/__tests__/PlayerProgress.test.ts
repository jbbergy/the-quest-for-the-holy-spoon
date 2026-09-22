import { describe, expect, it } from 'vitest'

import { idFrom, type PlayerId } from '@/core/identity'
import { xpThresholdForLevel } from '@/modules/gamification/domain/Level'
import { Milestone, PlayerProgress } from '@/modules/gamification/domain/PlayerProgress'
import { XpAmount } from '@/modules/gamification/domain/XpAmount'

const playerId: PlayerId = idFrom('p-1')
const xp = (value: number): XpAmount => XpAmount.reconstitute(value)

describe('PlayerProgress', () => {
  it('démarre à zéro XP, niveau 1, sans palier', () => {
    const progress = PlayerProgress.start(playerId)

    expect(progress.totalXp.value).toBe(0)
    expect(progress.level.value).toBe(1)
    expect(progress.unlockedMilestones).toEqual([])
  })

  describe('award', () => {
    it('retourne une nouvelle instance sans muter l’originale', () => {
      const original = PlayerProgress.start(playerId)

      const gain = original.award(xp(50))

      expect(gain.progress).not.toBe(original)
      expect(gain.progress.totalXp.value).toBe(50)
      expect(original.totalXp.value).toBe(0)
      expect(original.level.value).toBe(1)
    })

    it('conserve le joueur', () => {
      const gain = PlayerProgress.start(playerId).award(xp(10))

      expect(gain.progress.playerId).toBe(playerId)
    })

    it('cumule les gains successifs', () => {
      const first = PlayerProgress.start(playerId).award(xp(30))
      const second = first.progress.award(xp(45))

      expect(second.progress.totalXp.value).toBe(75)
    })

    it('n’annonce pas de montée de niveau quand le seuil n’est pas franchi', () => {
      const gain = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(2) - 1))

      expect(gain.levelledUp).toBe(false)
      expect(gain.levelsGained).toBe(0)
      expect(gain.progress.level.value).toBe(1)
    })

    it('annonce la montée de niveau au franchissement du seuil', () => {
      const gain = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(2)))

      expect(gain.levelledUp).toBe(true)
      expect(gain.levelsGained).toBe(1)
      expect(gain.progress.level.value).toBe(2)
    })

    it('compte les niveaux gagnés d’un coup sur un gros gain', () => {
      const gain = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(5)))

      expect(gain.levelsGained).toBe(4)
      expect(gain.progress.level.value).toBe(5)
    })

    it('rapporte l’XP effectivement attribuée', () => {
      const gain = PlayerProgress.start(playerId).award(xp(42))

      expect(gain.awarded.value).toBe(42)
    })

    it('un gain nul ne change rien mais reste une opération valide', () => {
      const original = PlayerProgress.start(playerId).award(xp(60)).progress

      const gain = original.award(XpAmount.zero())

      expect(gain.progress.totalXp.value).toBe(60)
      expect(gain.levelledUp).toBe(false)
      expect(gain.unlockedMilestones).toEqual([])
    })
  })

  describe('paliers', () => {
    it('ne débloque un palier qu’au niveau requis', () => {
      const apprentice = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(2)))

      expect(apprentice.unlockedMilestones).toEqual([Milestone.APPRENTICE])
      expect(apprentice.progress.hasMilestone(Milestone.APPRENTICE)).toBe(true)
      expect(apprentice.progress.hasMilestone(Milestone.COOK)).toBe(false)
    })

    it('rapporte tous les paliers franchis en une seule montée', () => {
      const gain = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(10)))

      expect(gain.unlockedMilestones).toEqual([
        Milestone.APPRENTICE,
        Milestone.COOK,
        Milestone.CHEF,
      ])
    })

    it('ne re-signale pas un palier déjà franchi', () => {
      const chef = PlayerProgress.start(playerId).award(xp(xpThresholdForLevel(10))).progress

      const gain = chef.award(xp(10))

      expect(gain.unlockedMilestones).toEqual([])
      expect(chef.unlockedMilestones).toHaveLength(3)
    })

    it('déduit les paliers acquis du niveau, sans état redondant', () => {
      const master = PlayerProgress.reconstitute({
        playerId,
        totalXp: xpThresholdForLevel(25),
      })

      expect(master.hasMilestone(Milestone.MASTER)).toBe(true)
      expect(master.hasMilestone(Milestone.GRAIL_BEARER)).toBe(false)
      expect(master.unlockedMilestones).toHaveLength(4)
    })
  })

  it('se réhydrate en recalculant le niveau depuis le total d’XP', () => {
    const progress = PlayerProgress.reconstitute({
      playerId,
      totalXp: xpThresholdForLevel(7) + 12,
    })

    expect(progress.level.value).toBe(7)
    expect(progress.level.xpIntoCurrentLevel()).toBe(12)
  })

  it('sérialise sans le niveau, qui reste une donnée dérivée', () => {
    const progress = PlayerProgress.reconstitute({ playerId, totalXp: 500 })

    expect(progress.toJSON()).toEqual({ playerId, totalXp: 500 })
  })
})
