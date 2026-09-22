import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { ok, type Result } from '@/core/result'

import type { PlayerProgress } from '../domain/PlayerProgress'
import type { IPlayerProgressRepository } from '../domain/repositories'

/** Adaptateur en mémoire de la progression, pour les tests de Use Cases. */
export class InMemoryPlayerProgressRepository implements IPlayerProgressRepository {
  private readonly progress = new Map<string, PlayerProgress>()

  async findByPlayer(playerId: PlayerId): Promise<Result<PlayerProgress | null, RepositoryError>> {
    return ok(this.progress.get(playerId) ?? null)
  }

  async save(progress: PlayerProgress): Promise<Result<void, RepositoryError>> {
    this.progress.set(progress.playerId, progress)
    return ok(undefined)
  }
}
