import { describe, expect, it, vi } from 'vitest'

import { idFrom } from '@/core/identity'

import { Email } from '@/core/Email'
import { ApiClient } from '@/contract/apiClient'

import { HttpAccountGateway } from '../HttpAccountGateway'

const EMAIL = Email.reconstitute('camille@example.fr')
const ACCOUNT = { id: 'account-1', email: 'camille@example.fr', playerId: null }

const respond = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function gatewayAnswering(response: Response | Error) {
  const fetchFn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { gateway: new HttpAccountGateway(new ApiClient(fetchFn as unknown as typeof fetch)), fetchFn }
}

describe('HttpAccountGateway', () => {
  it('lit la session en cours', async () => {
    const { gateway } = gatewayAnswering(respond(200, { account: ACCOUNT }))

    expect(await gateway.currentSession()).toEqual({
      ok: true,
      value: { accountId: 'account-1', email: 'camille@example.fr', playerId: null },
    })
  })

  it('distingue l’absence de session d’une erreur', async () => {
    const { gateway } = gatewayAnswering(respond(200, { account: null }))

    expect(await gateway.currentSession()).toEqual({ ok: true, value: null })
  })

  it('appelle l’API sur la même origine, sans autre en-tête que le type du corps', async () => {
    const { gateway, fetchFn } = gatewayAnswering(respond(200, { account: ACCOUNT }))

    await gateway.signIn(EMAIL, 'cuillère en bois dorée')

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/login')
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'camille@example.fr',
      password: 'cuillère en bois dorée',
    })
  })

  it('transmet le code d’un refus du serveur', async () => {
    const { gateway } = gatewayAnswering(
      respond(401, { error: { code: 'INVALID_CREDENTIALS', message: 'non' } }),
    )

    const result = await gateway.signIn(EMAIL, 'mauvais')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: 'remote', code: 'INVALID_CREDENTIALS', status: 401 })
    }
  })

  it('tient un serveur absent pour injoignable', async () => {
    const { gateway } = gatewayAnswering(new TypeError('Failed to fetch'))

    const result = await gateway.currentSession()

    expect(!result.ok && result.error.code).toBe('SERVER_UNREACHABLE')
  })

  it('tient une erreur 5xx du proxy pour un serveur injoignable', async () => {
    const { gateway } = gatewayAnswering(new Response('Bad Gateway', { status: 502 }))

    const result = await gateway.signOut()

    expect(!result.ok && result.error.code).toBe('SERVER_UNREACHABLE')
  })

  it('rejette une réponse non conforme au contrat', async () => {
    const { gateway } = gatewayAnswering(respond(200, { account: { id: 42 } }))

    const result = await gateway.verifyEmail('jeton-de-test-assez-long')

    expect(!result.ok && result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
  })

  it('exige une session quand une action doit en ouvrir une', async () => {
    const { gateway } = gatewayAnswering(respond(200, { account: null }))

    const result = await gateway.resetPassword('jeton-de-test-assez-long', 'nouvelle phrase')

    expect(result.ok).toBe(false)
  })

  it.each([
    ['signUp', (g: HttpAccountGateway) => g.signUp(EMAIL, 'phrase de passe longue'), '/api/auth/signup', 202],
    ['requestPasswordReset', (g: HttpAccountGateway) => g.requestPasswordReset(EMAIL), '/api/auth/password/forgot', 202],
    ['signOut', (g: HttpAccountGateway) => g.signOut(), '/api/auth/logout', 204],
    ['deleteAccount', (g: HttpAccountGateway) => g.deleteAccount('phrase'), '/api/auth/account', 204],
  ] as const)('%s réussit sur une réponse sans contenu utile', async (_name, call, url, status) => {
    const { gateway, fetchFn } = gatewayAnswering(
      respond(status, status === 202 ? { status: 'accepted' } : undefined),
    )

    expect(await call(gateway)).toEqual({ ok: true, value: undefined })
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(url)
  })

  it('rattache un profil', async () => {
    const { gateway, fetchFn } = gatewayAnswering(
      respond(200, { account: { ...ACCOUNT, playerId: 'player-1' } }),
    )

    const result = await gateway.linkPlayer(idFrom<'PlayerId'>('player-1'))

    expect(result.ok && result.value.playerId).toBe('player-1')
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('PUT')
  })
})
