import { describe, expect, it, vi } from 'vitest'

import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'

import type { AccountSession, IAccountGateway } from '../../domain/AccountGateway'
import {
  DeleteAccountUseCase,
  GetSessionUseCase,
  LinkPlayerUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignInUseCase,
  SignOutUseCase,
  SignUpUseCase,
  VerifyEmailUseCase,
} from '../useCases'

const SESSION: AccountSession = {
  accountId: idFrom<'AccountId'>('account-1'),
  email: 'camille@example.fr',
  playerId: null,
}

function fakeGateway() {
  return {
    currentSession: vi.fn(async () => ok(SESSION)),
    signUp: vi.fn(async () => ok(undefined)),
    verifyEmail: vi.fn(async () => ok(SESSION)),
    signIn: vi.fn(async () => ok(SESSION)),
    signOut: vi.fn(async () => ok(undefined)),
    requestPasswordReset: vi.fn(async () => ok(undefined)),
    resetPassword: vi.fn(async () => ok(SESSION)),
    linkPlayer: vi.fn(async () => ok(SESSION)),
    deleteAccount: vi.fn(async () => ok(undefined)),
  } satisfies IAccountGateway
}

describe('Use cases des comptes', () => {
  it('valide l’adresse et le mot de passe avant de s’inscrire', async () => {
    const gateway = fakeGateway()
    const signUp = new SignUpUseCase(gateway)

    const badEmail = await signUp.execute({ email: 'camille', password: 'phrase de passe longue' })
    const weak = await signUp.execute({ email: 'camille@example.fr', password: 'court' })
    const good = await signUp.execute({ email: ' Camille@Example.fr', password: 'phrase de passe longue' })

    expect(!badEmail.ok && badEmail.error.code).toBe('INVALID_EMAIL')
    expect(!weak.ok && weak.error.code).toBe('WEAK_PASSWORD')
    expect(good.ok).toBe(true)
    expect(gateway.signUp).toHaveBeenCalledTimes(1)
    expect((gateway.signUp.mock.calls[0] as unknown as [{ value: string }])[0].value).toBe(
      'camille@example.fr',
    )
  })

  it('ne juge pas la longueur d’un mot de passe à la connexion', async () => {
    const gateway = fakeGateway()

    const result = await new SignInUseCase(gateway).execute({
      email: 'camille@example.fr',
      password: 'court',
    })

    expect(result.ok).toBe(true)
    expect(gateway.signIn).toHaveBeenCalled()
  })

  it('refuse une adresse mal formée à la connexion sans appeler le serveur', async () => {
    const gateway = fakeGateway()

    const result = await new SignInUseCase(gateway).execute({ email: 'camille', password: 'x' })

    expect(!result.ok && result.error.code).toBe('INVALID_EMAIL')
    expect(gateway.signIn).not.toHaveBeenCalled()
  })

  it('valide le nouveau mot de passe avant de réinitialiser', async () => {
    const gateway = fakeGateway()
    const reset = new ResetPasswordUseCase(gateway)

    const weak = await reset.execute({ token: 'jeton', password: 'court' })
    const good = await reset.execute({ token: 'jeton', password: 'phrase de passe longue' })

    expect(!weak.ok && weak.error.code).toBe('WEAK_PASSWORD')
    expect(good).toEqual({ ok: true, value: SESSION })
  })

  it('valide l’adresse d’une demande de réinitialisation', async () => {
    const gateway = fakeGateway()
    const request = new RequestPasswordResetUseCase(gateway)

    expect((await request.execute('camille')).ok).toBe(false)
    expect((await request.execute('camille@example.fr')).ok).toBe(true)
  })

  it('délègue le reste à la passerelle', async () => {
    const gateway = fakeGateway()
    const player = idFrom<'PlayerId'>('player-1')

    await new GetSessionUseCase(gateway).execute()
    await new VerifyEmailUseCase(gateway).execute('jeton')
    await new SignOutUseCase(gateway).execute()
    await new LinkPlayerUseCase(gateway).execute(player)
    await new DeleteAccountUseCase(gateway).execute('phrase')

    expect(gateway.currentSession).toHaveBeenCalled()
    expect(gateway.verifyEmail).toHaveBeenCalledWith('jeton')
    expect(gateway.signOut).toHaveBeenCalled()
    expect(gateway.linkPlayer).toHaveBeenCalledWith(player)
    expect(gateway.deleteAccount).toHaveBeenCalledWith('phrase')
  })
})
