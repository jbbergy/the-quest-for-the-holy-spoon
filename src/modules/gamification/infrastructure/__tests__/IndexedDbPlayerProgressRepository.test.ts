import { beforeEach, describe, expect, it } from 'vitest'

import type { DatabaseProvider } from '@/core/infrastructure/database'
import { createTestDatabase } from '@/core/infrastructure/__tests__/testDatabase'
import { idFrom, type PlayerId } from '@/core/identity'
import { xpThresholdForLevel } from '@/modules/gamification/domain/Level'
import { Milestone, PlayerProgress } from '@/modules/gamification/domain/PlayerProgress'
import { XpAmount } from '@/modules/gamification/domain/XpAmount'
import { IndexedDbPlayerProgressRepository } from '@/modules/gamification/infrastructure/IndexedDbPlayerProgressRepository'

let databases: DatabaseProvider
let repository: IndexedDbPlayerProgressRepository

const playerId: PlayerId = idFrom('player-1')

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`opération en échec : ${result.error.message}`)
  return result.value
}

beforeEach(() => {
  databases = createTestDatabase()
  repository = new IndexedDbPlayerProgressRepository(databases)
})

describe('IndexedDbPlayerProgressRepository', () => {
  it('retourne null tant que le joueur n’a aucune progression', async () => {
    expect(unwrap(await repository.findByPlayer(playerId))).toBeNull()
  })

  it('restitue la progression enregistrée', async () => {
    const progress = PlayerProgress.start(playerId).award(XpAmount.reconstitute(120)).progress
    unwrap(await repository.save(progress))

    const found = unwrap(await repository.findByPlayer(playerId))

    expect(found?.totalXp.value).toBe(120)
    expect(found?.playerId).toBe(playerId)
  })

  it('recalcule le niveau à la relecture plutôt que de le stocker', async () => {
    const xp = xpThresholdForLevel(8) + 40
    unwrap(
      await repository.save(
        PlayerProgress.start(playerId).award(XpAmount.reconstitute(xp)).progress,
      ),
    )

    const found = unwrap(await repository.findByPlayer(playerId))

    expect(found?.level.value).toBe(8)
    expect(found?.level.xpIntoCurrentLevel()).toBe(40)
    expect(found?.hasMilestone(Milestone.COOK)).toBe(true)
  })

  it('remplace la progression existante du joueur', async () => {
    const first = PlayerProgress.start(playerId).award(XpAmount.reconstitute(50)).progress
    unwrap(await repository.save(first))
    unwrap(await repository.save(first.award(XpAmount.reconstitute(70)).progress))

    const found = unwrap(await repository.findByPlayer(playerId))

    expect(found?.totalXp.value).toBe(120)
  })

  it('isole les progressions de deux joueurs', async () => {
    const other: PlayerId = idFrom('player-2')
    unwrap(
      await repository.save(
        PlayerProgress.start(playerId).award(XpAmount.reconstitute(100)).progress,
      ),
    )
    unwrap(
      await repository.save(
        PlayerProgress.start(other).award(XpAmount.reconstitute(500)).progress,
      ),
    )

    expect(unwrap(await repository.findByPlayer(playerId))?.totalXp.value).toBe(100)
    expect(unwrap(await repository.findByPlayer(other))?.totalXp.value).toBe(500)
  })

  it('restitue une progression vierge', async () => {
    unwrap(await repository.save(PlayerProgress.start(playerId)))

    const found = unwrap(await repository.findByPlayer(playerId))

    expect(found?.totalXp.value).toBe(0)
    expect(found?.level.value).toBe(1)
  })

  it('convertit une panne de stockage en Result en échec', async () => {
    await databases.close()
    globalThis.indexedDB = undefined as unknown as IDBFactory

    const result = await repository.findByPlayer(playerId)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('repository')
  })
})
