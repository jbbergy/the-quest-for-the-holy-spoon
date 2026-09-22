import type { PlayerId } from '@/core/identity'

import { Level } from './Level'
import { XpAmount } from './XpAmount'

/** Paliers narratifs, franchis en atteignant un niveau donné. */
export const Milestone = {
  APPRENTICE: 'APPRENTICE',
  COOK: 'COOK',
  CHEF: 'CHEF',
  MASTER: 'MASTER',
  GRAIL_BEARER: 'GRAIL_BEARER',
} as const
export type Milestone = (typeof Milestone)[keyof typeof Milestone]

export const MILESTONE_LEVEL: Readonly<Record<Milestone, number>> = {
  [Milestone.APPRENTICE]: 2,
  [Milestone.COOK]: 5,
  [Milestone.CHEF]: 10,
  [Milestone.MASTER]: 25,
  [Milestone.GRAIL_BEARER]: 50,
}

/** Ce qu'un gain d'XP a produit — de quoi déclencher les animations de phase 5. */
export interface ProgressGain {
  readonly progress: PlayerProgress
  readonly awarded: XpAmount
  readonly levelledUp: boolean
  readonly levelsGained: number
  readonly unlockedMilestones: readonly Milestone[]
}

export interface PlayerProgressProps {
  readonly playerId: PlayerId
  readonly totalXp: number
}

/**
 * La progression du joueur dans le jeu.
 *
 * Ce contexte ignore tout du corps du joueur et de ses repas : il ne réagit
 * qu'aux payloads d'événements publiés par les autres modules. Immuable —
 * `award()` retourne un nouvel état accompagné de ce qui vient de se produire.
 */
export class PlayerProgress {
  private constructor(
    readonly playerId: PlayerId,
    readonly totalXp: XpAmount,
    readonly level: Level,
  ) {}

  static start(playerId: PlayerId): PlayerProgress {
    return new PlayerProgress(playerId, XpAmount.zero(), Level.fromTotalXp(0))
  }

  static reconstitute(props: PlayerProgressProps): PlayerProgress {
    return new PlayerProgress(
      props.playerId,
      XpAmount.reconstitute(props.totalXp),
      Level.fromTotalXp(props.totalXp),
    )
  }

  /** Paliers déjà franchis, déduits du niveau courant — jamais stockés en double. */
  get unlockedMilestones(): readonly Milestone[] {
    return milestonesUpTo(this.level.value)
  }

  hasMilestone(milestone: Milestone): boolean {
    return this.level.value >= MILESTONE_LEVEL[milestone]
  }

  /**
   * Attribue de l'XP et retourne le nouvel état **plus** le détail de ce qui a
   * changé : la présentation a besoin de savoir qu'un niveau a été franchi, pas
   * seulement que le total a bougé.
   */
  award(xp: XpAmount): ProgressGain {
    const totalXp = this.totalXp.plus(xp)
    const level = Level.fromTotalXp(totalXp.value)
    const progress = new PlayerProgress(this.playerId, totalXp, level)
    const levelsGained = level.value - this.level.value

    return {
      progress,
      awarded: xp,
      levelledUp: levelsGained > 0,
      levelsGained,
      unlockedMilestones: milestonesBetween(this.level.value, level.value),
    }
  }

  toJSON(): PlayerProgressProps {
    return { playerId: this.playerId, totalXp: this.totalXp.value }
  }
}

function milestonesUpTo(level: number): readonly Milestone[] {
  return (Object.keys(MILESTONE_LEVEL) as Milestone[]).filter(
    (milestone) => level >= MILESTONE_LEVEL[milestone],
  )
}

function milestonesBetween(fromLevel: number, toLevel: number): readonly Milestone[] {
  return (Object.keys(MILESTONE_LEVEL) as Milestone[]).filter((milestone) => {
    const required = MILESTONE_LEVEL[milestone]
    return required > fromLevel && required <= toLevel
  })
}
