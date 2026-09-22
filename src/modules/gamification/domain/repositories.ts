import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { PlayerProgress } from './PlayerProgress'

export interface IPlayerProgressRepository {
  findByPlayer(playerId: PlayerId): Promise<Result<PlayerProgress | null, RepositoryError>>
  save(progress: PlayerProgress): Promise<Result<void, RepositoryError>>
}
