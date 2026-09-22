import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { Player } from './Player'

/**
 * Port de persistance du profil.
 *
 * L'application démarre en 100 % local (un seul joueur sur l'appareil), mais la
 * signature ne présuppose rien du support : elle ne parle que de `Player` et
 * d'identifiants. Brancher un backend distant plus tard reste un changement
 * d'adaptateur.
 */
export interface IPlayerRepository {
  findById(id: PlayerId): Promise<Result<Player | null, RepositoryError>>
  /** Le profil actif de l'appareil — `null` tant que l'onboarding n'a pas eu lieu. */
  findCurrent(): Promise<Result<Player | null, RepositoryError>>
  save(player: Player): Promise<Result<void, RepositoryError>>
  delete(id: PlayerId): Promise<Result<void, RepositoryError>>
}
