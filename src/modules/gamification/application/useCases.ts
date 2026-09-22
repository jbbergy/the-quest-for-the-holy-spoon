import { ApplicationError, type RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import { PlayerProgress, type ProgressGain } from '../domain/PlayerProgress'
import type { IPlayerProgressRepository } from '../domain/repositories'
import { XpRewardPolicy } from '../domain/XpRewardPolicy'

import { toMealLoggedFacts } from './adapters'

import type { MealLoggedEvent } from '@/modules/nutrition_inventory/application'

export type GamificationError = ApplicationError | RepositoryError

/**
 * Attribue l'XP d'un repas enregistré.
 *
 * Déclenché par l'événement `meal_logged`, jamais appelé directement par
 * `nutrition_inventory` : c'est ce qui permet d'ajouter, de modifier ou de
 * retirer entièrement la gamification sans toucher au suivi nutritionnel.
 *
 * La progression est créée à la volée si le joueur n'en a pas encore : rien
 * n'oblige l'onboarding à initialiser le jeu.
 */
export class AwardXpForMealUseCase {
  constructor(private readonly progressRepository: IPlayerProgressRepository) {}

  async execute(event: MealLoggedEvent): Promise<Result<ProgressGain, GamificationError>> {
    const { playerId } = event.payload

    const existing = await this.progressRepository.findByPlayer(playerId)
    if (!existing.ok) {
      return err(
        new ApplicationError('PROGRESS_UNREADABLE', 'La progression n’a pas pu être lue.', {
          cause: existing.error,
        }),
      )
    }

    const progress = existing.value ?? PlayerProgress.start(playerId)
    const xp = XpRewardPolicy.xpForMealLogged(toMealLoggedFacts(event.payload))
    const gain = progress.award(xp)

    const saved = await this.progressRepository.save(gain.progress)
    if (!saved.ok) {
      return err(
        new ApplicationError('PROGRESS_NOT_SAVED', 'La progression n’a pas pu être enregistrée.', {
          cause: saved.error,
        }),
      )
    }

    return ok(gain)
  }
}

/** Charge la progression d'un joueur, ou une progression vierge s'il n'en a pas. */
export class GetPlayerProgressUseCase {
  constructor(private readonly progressRepository: IPlayerProgressRepository) {}

  async execute(playerId: PlayerId): Promise<Result<PlayerProgress, GamificationError>> {
    const found = await this.progressRepository.findByPlayer(playerId)
    if (!found.ok) {
      return err(
        new ApplicationError('PROGRESS_UNREADABLE', 'La progression n’a pas pu être lue.', {
          cause: found.error,
        }),
      )
    }
    return ok(found.value ?? PlayerProgress.start(playerId))
  }
}
