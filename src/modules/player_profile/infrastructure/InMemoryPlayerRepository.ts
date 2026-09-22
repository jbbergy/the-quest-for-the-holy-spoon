import type { RepositoryError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { ok, type Result } from '@/core/result'

import type { Player } from '../domain/Player'
import type { IPlayerRepository } from '../domain/repositories'

/**
 * Adaptateur en mémoire du profil — second adaptateur du même port, utilisé par
 * les tests de Use Cases et preuve que le port n'a rien emprunté à IndexedDB.
 */
export class InMemoryPlayerRepository implements IPlayerRepository {
  private readonly players = new Map<string, Player>()
  private currentId: string | null = null

  async findById(id: PlayerId): Promise<Result<Player | null, RepositoryError>> {
    return ok(this.players.get(id) ?? null)
  }

  async findCurrent(): Promise<Result<Player | null, RepositoryError>> {
    if (this.currentId === null) return ok(null)
    return ok(this.players.get(this.currentId) ?? null)
  }

  async save(player: Player): Promise<Result<void, RepositoryError>> {
    this.players.set(player.id, player)
    this.currentId = player.id
    return ok(undefined)
  }

  async delete(id: PlayerId): Promise<Result<void, RepositoryError>> {
    this.players.delete(id)
    if (this.currentId === id) this.currentId = null
    return ok(undefined)
  }
}
