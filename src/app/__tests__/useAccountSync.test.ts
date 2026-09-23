import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, fakeSyncEngine } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ServerUnreachableError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex, BodyMeasurements } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { useAccountSync } from '../useAccountSync'

const playerId = idFrom<'PlayerId'>('player-1')
const player = Player.reconstitute({
  id: playerId,
  name: 'Perceval',
  measurements: BodyMeasurements.reconstitute({
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
  }),
  activityLevel: ActivityLevel.MODERATE,
  preferences: DietaryPreferences.none(),
})
const session = { accountId: idFrom<'AccountId'>('account-1'), email: 'a@b.fr', playerId: null }

const linkPlayer = vi.fn(async () => ok({ ...session, playerId }))

beforeEach(() => {
  setActivePinia(createPinia())
  linkPlayer.mockClear()
  provideContainer(createFakeContainer({ account: { linkPlayer: { execute: linkPlayer } } }))
})

afterEach(() => {
  resetContainer()
})

describe('useAccountSync', () => {
  it('rattache le profil de l’appareil à un compte qui n’en a pas', async () => {
    useAccountStore().session = session
    usePlayerStore().player = player

    await useAccountSync().linkLocalProfile()

    expect(linkPlayer).toHaveBeenCalledWith(playerId)
    expect(useAccountStore().session?.playerId).toBe(playerId)
  })

  it('ne fait rien sans session ou sans profil', async () => {
    await useAccountSync().linkLocalProfile()
    useAccountStore().session = session
    await useAccountSync().linkLocalProfile()

    expect(linkPlayer).not.toHaveBeenCalled()
  })

  it('ne touche pas à un compte déjà rattaché', async () => {
    useAccountStore().session = { ...session, playerId: idFrom<'PlayerId'>('player-2') }
    usePlayerStore().player = player

    await useAccountSync().linkLocalProfile()

    expect(linkPlayer).not.toHaveBeenCalled()
  })
})

describe('useAccountSync — synchronisation', () => {
  const linked = { ...session, playerId }

  function withEngine(engine: Partial<ReturnType<typeof fakeSyncEngine>>, account = {}) {
    const sync = Object.assign(fakeSyncEngine(), engine)
    provideContainer(createFakeContainer({ sync, account }))
    return sync
  }

  it('branche l’appareil sur le compte, et recharge le profil téléchargé', async () => {
    const connect = vi.fn(async () => ok('downloaded' as const))
    const getCurrent = vi.fn(async () => ok(player))
    const sync = Object.assign(fakeSyncEngine(), { connect })
    provideContainer(createFakeContainer({ sync, profile: { getCurrent: { execute: getCurrent } } }))
    useAccountStore().session = linked

    expect(await useAccountSync().connect()).toBe('downloaded')
    expect(connect).toHaveBeenCalledWith({ accountId: 'account-1', playerId }, null)
    expect(usePlayerStore().player).toBe(player)
  })

  it('ne branche rien sans session ni profil rattaché', async () => {
    const connect = vi.fn()
    withEngine({ connect })

    expect(await useAccountSync().connect()).toBeNull()
    useAccountStore().session = session
    expect(await useAccountSync().connect()).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it('ne rend rien quand le branchement échoue', async () => {
    withEngine({ connect: async () => ({ ok: false, error: new Error('x') }) } as never)
    useAccountStore().session = linked

    expect(await useAccountSync().connect()).toBeNull()
  })

  it('refuse de déconnecter tant que des modifications n’ont pas pu partir', async () => {
    const signOut = vi.fn(async () => ok(undefined))
    const disconnect = vi.fn(async () => ok(undefined))
    withEngine(
      { status: { phase: 'offline', pending: 2, lastSyncedAt: null, error: null }, flush: async () => 2, disconnect },
      { signOut: { execute: signOut } },
    )
    useAccountStore().session = linked

    expect(await useAccountSync().signOut()).toEqual({ signedOut: false, pending: 2 })
    expect(signOut).not.toHaveBeenCalled()

    expect(await useAccountSync().signOut({ force: true })).toEqual({ signedOut: true, pending: 0 })
    expect(disconnect).toHaveBeenCalledWith({ wipe: true })
    expect(useAccountStore().session).toBeNull()
  })

  it('garde la copie locale quand le compte est supprimé', async () => {
    const disconnect = vi.fn(async () => ok(undefined))
    withEngine({ disconnect })

    expect(await useAccountSync().deleteAccount('phrase')).toBe(true)
    expect(disconnect).toHaveBeenCalledWith({ wipe: false })
  })

  it('ne touche à rien si le serveur refuse la suppression', async () => {
    const disconnect = vi.fn()
    withEngine(
      { disconnect },
      { deleteAccount: { execute: async () => ({ ok: false, error: new ServerUnreachableError('x') }) } },
    )

    expect(await useAccountSync().deleteAccount('phrase')).toBe(false)
    expect(disconnect).not.toHaveBeenCalled()
  })
})
