/**
 * Façade publique de `gamification`.
 *
 * Le module ne s'expose que par des Use Cases et un read model de progression.
 * Aucun autre contexte n'a besoin de connaître `PlayerProgress`, `Level` ou le
 * barème d'XP.
 */
import type { PlayerId } from '@/core/identity'

import type { PlayerProgress } from '../domain/PlayerProgress'

export { toMealLoggedFacts } from './adapters'
export {
  AwardXpForMealUseCase,
  GetPlayerProgressUseCase,
  type GamificationError,
} from './useCases'

/** Read model de progression, destiné aux jauges de la couche présentation. */
export interface PlayerProgressView {
  readonly playerId: PlayerId
  readonly level: number
  readonly totalXp: number
  readonly xpIntoCurrentLevel: number
  readonly xpToNextLevel: number | null
  readonly progressRatio: number
  readonly milestones: readonly string[]
}

export function toProgressView(progress: PlayerProgress): PlayerProgressView {
  return {
    playerId: progress.playerId,
    level: progress.level.value,
    totalXp: progress.totalXp.value,
    xpIntoCurrentLevel: progress.level.xpIntoCurrentLevel(),
    xpToNextLevel: progress.level.xpToNextLevel(),
    progressRatio: progress.level.progressRatio(),
    milestones: [...progress.unlockedMilestones],
  }
}
