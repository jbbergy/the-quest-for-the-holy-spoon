import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { RemoteRejectedError, ServerUnreachableError } from '@/core/errors'
import { idFrom } from '@/core/identity'

import type { AccountSession } from '../../application'
import { useAccountStore } from '../useAccountStore'

const session: AccountSession = {
  accountId: idFrom<'AccountId'>('account-1'),
  email: 'camille@example.fr',
  playerId: null,
}

const credentials = { email: 'camille@example.fr', password: 'phrase de passe longue' }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useAccountStore', () => {
  it('charge la session en cours', async () => {
    provideContainer(createFakeContainer({ account: { getSession: succeedsWith(session) } }))
    const store = useAccountStore()

    expect(await store.load()).toBe(true)
    expect(store.session).toEqual(session)
    expect(store.isSignedIn).toBe(true)
    expect(store.status).toBe('ready')
  })

  it('distingue un serveur injoignable d’une absence de session', async () => {
    provideContainer(
      createFakeContainer({
        account: { getSession: failsWith(new ServerUnreachableError('hors ligne')) },
      }),
    )
    const store = useAccountStore()

    expect(await store.load()).toBe(false)
    expect(store.status).toBe('unreachable')
    expect(store.error?.code).toBe('SERVER_UNREACHABLE')
  })

  it('ouvre la session à la connexion', async () => {
    provideContainer(createFakeContainer({ account: { signIn: succeedsWith(session) } }))
    const store = useAccountStore()

    expect(await store.signIn(credentials)).toBe(true)
    expect(store.session).toEqual(session)
  })

  it('expose le refus du serveur', async () => {
    provideContainer(
      createFakeContainer({
        account: {
          signIn: failsWith(new RemoteRejectedError('INVALID_CREDENTIALS', 'non', 401)),
        },
      }),
    )
    const store = useAccountStore()

    expect(await store.signIn(credentials)).toBe(false)
    expect(store.status).toBe('error')
    expect(store.error?.code).toBe('INVALID_CREDENTIALS')
    expect(store.session).toBeNull()

    store.clearError()
    expect(store.error).toBeNull()
    expect(store.status).toBe('ready')
  })

  it('n’ouvre pas de session à l’inscription', async () => {
    provideContainer(createFakeContainer())
    const store = useAccountStore()

    expect(await store.signUp(credentials)).toBe(true)
    expect(store.session).toBeNull()
  })

  it('ouvre la session par un lien de confirmation ou de réinitialisation', async () => {
    provideContainer(
      createFakeContainer({
        account: { verifyEmail: succeedsWith(session), resetPassword: succeedsWith(session) },
      }),
    )
    const store = useAccountStore()

    expect(await store.verifyEmail('jeton')).toBe(true)
    expect(store.session).toEqual(session)

    store.session = null
    expect(await store.resetPassword({ token: 'jeton', password: 'phrase' })).toBe(true)
    expect(store.session).toEqual(session)
  })

  it('met à jour la session après rattachement du profil', async () => {
    const linked = { ...session, playerId: idFrom<'PlayerId'>('player-1') }
    provideContainer(createFakeContainer({ account: { linkPlayer: succeedsWith(linked) } }))
    const store = useAccountStore()

    expect(await store.linkPlayer(idFrom<'PlayerId'>('player-1'))).toBe(true)
    expect(store.session?.playerId).toBe('player-1')
  })

  it('ferme la session à la déconnexion et à la suppression', async () => {
    provideContainer(createFakeContainer({ account: { signIn: succeedsWith(session) } }))
    const store = useAccountStore()

    await store.signIn(credentials)
    expect(await store.signOut()).toBe(true)
    expect(store.session).toBeNull()

    await store.signIn(credentials)
    expect(await store.deleteAccount('phrase')).toBe(true)
    expect(store.session).toBeNull()
  })

  it('garde la session si le serveur devient injoignable en cours de route', async () => {
    provideContainer(
      createFakeContainer({
        account: {
          signIn: succeedsWith(session),
          signOut: failsWith(new ServerUnreachableError('hors ligne')),
        },
      }),
    )
    const store = useAccountStore()

    await store.signIn(credentials)
    expect(await store.signOut()).toBe(false)
    expect(store.session).toEqual(session)
    expect(store.status).toBe('error')
  })

  it('accepte une demande de réinitialisation', async () => {
    provideContainer(createFakeContainer())
    const store = useAccountStore()

    expect(await store.requestPasswordReset('camille@example.fr')).toBe(true)
  })
})
