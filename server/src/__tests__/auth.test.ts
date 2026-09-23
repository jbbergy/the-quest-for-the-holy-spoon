import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TestServer, startTestServer, TestClient } from './testServer'

const EMAIL = 'camille@example.fr'
const PASSWORD = 'cuillère en bois dorée'

let server: TestServer
let browser: TestClient

beforeEach(async () => {
  server = await startTestServer()
  browser = new TestClient(server.app)
})

afterEach(async () => {
  await server.close()
})

/** Inscription complète : formulaire, puis clic sur le lien reçu. */
async function registerAndVerify(client: TestClient, email = EMAIL): Promise<void> {
  await client.request('POST', '/auth/signup', { email, password: PASSWORD })
  const verified = await client.request('POST', '/auth/verify', {
    token: server.mailer.lastTokenFor(email),
  })
  expect(verified.statusCode).toBe(200)
}

describe('Inscription', () => {
  it('envoie un lien de confirmation, sans ouvrir de session', async () => {
    const response = await browser.request('POST', '/auth/signup', {
      email: '  Camille@Example.FR ',
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ status: 'accepted' })
    expect(browser.hasSession).toBe(false)
    expect(server.mailer.sent).toHaveLength(1)
    expect(server.mailer.sent[0]).toMatchObject({ to: EMAIL, subject: 'Confirmez votre adresse e-mail' })
    expect(server.mailer.sent[0]!.text).toContain('http://localhost:5173/verifier-email#token=')
  })

  it('ouvre la session au clic sur le lien', async () => {
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })
    const verified = await browser.request('POST', '/auth/verify', {
      token: server.mailer.lastTokenFor(EMAIL),
    })

    expect(verified.json()).toMatchObject({ account: { email: EMAIL, playerId: null } })
    const session = await browser.request('GET', '/auth/session')
    expect(session.json()).toMatchObject({ account: { email: EMAIL } })
  })

  it('pose un cookie HttpOnly, SameSite=Lax, limité à /api', async () => {
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })
    const verified = await browser.request('POST', '/auth/verify', {
      token: server.mailer.lastTokenFor(EMAIL),
    })

    const cookie = verified.cookies.find((candidate) => candidate.name === 'hs_session')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' })
  })

  it('ne révèle pas qu’une adresse a déjà un compte', async () => {
    await registerAndVerify(new TestClient(server.app))
    const response = await browser.request('POST', '/auth/signup', {
      email: EMAIL,
      password: 'un tout autre mot de passe',
    })

    // Même réponse qu'une inscription neuve ; seul le titulaire est prévenu.
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ status: 'accepted' })
    expect(server.mailer.sent.at(-1)!.subject).toBe('Vous avez déjà un compte')

    const intruder = await browser.request('POST', '/auth/login', {
      email: EMAIL,
      password: 'un tout autre mot de passe',
    })
    expect(intruder.statusCode).toBe(401)
  })

  it('laisse la dernière inscription d’une adresse non confirmée l’emporter', async () => {
    // Un tiers inscrit l'adresse en premier, avec son propre mot de passe…
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: 'mot de passe du tiers' })
    const staleToken = server.mailer.lastTokenFor(EMAIL)
    // …puis la titulaire s'inscrit à son tour.
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })

    expect((await browser.request('POST', '/auth/verify', { token: staleToken })).statusCode).toBe(400)
    await browser.request('POST', '/auth/verify', { token: server.mailer.lastTokenFor(EMAIL) })

    const other = new TestClient(server.app)
    expect(
      (await other.request('POST', '/auth/login', { email: EMAIL, password: 'mot de passe du tiers' }))
        .statusCode,
    ).toBe(401)
    expect(
      (await other.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).statusCode,
    ).toBe(200)
  })

  it.each([
    [{ email: 'camille', password: PASSWORD }, 'INVALID_EMAIL'],
    [{ email: EMAIL, password: 'trop court' }, 'WEAK_PASSWORD'],
    [{ email: EMAIL }, 'BAD_REQUEST'],
  ])('refuse une saisie invalide (%o)', async (payload, code) => {
    const response = await browser.request('POST', '/auth/signup', payload)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: { code } })
    expect(server.mailer.sent).toHaveLength(0)
  })
})

describe('Lien de confirmation', () => {
  it('ne sert qu’une fois', async () => {
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })
    const token = server.mailer.lastTokenFor(EMAIL)

    await browser.request('POST', '/auth/verify', { token })
    const again = await browser.request('POST', '/auth/verify', { token })

    expect(again.statusCode).toBe(400)
    expect(again.json()).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('périme au bout de 24 heures', async () => {
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })
    server.advance(24 * 60 * 60 * 1000 + 1)

    const response = await browser.request('POST', '/auth/verify', {
      token: server.mailer.lastTokenFor(EMAIL),
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('Connexion', () => {
  beforeEach(async () => {
    await registerAndVerify(new TestClient(server.app))
  })

  it('ouvre une session avec les bons identifiants', async () => {
    const response = await browser.request('POST', '/auth/login', {
      email: 'CAMILLE@example.fr',
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    expect(browser.hasSession).toBe(true)
  })

  it('répond pareil pour une adresse inconnue et un mauvais mot de passe', async () => {
    const unknown = await browser.request('POST', '/auth/login', {
      email: 'personne@example.fr',
      password: PASSWORD,
    })
    const wrong = await browser.request('POST', '/auth/login', {
      email: EMAIL,
      password: 'pas le bon mot de passe',
    })

    expect(unknown.statusCode).toBe(401)
    expect(wrong.statusCode).toBe(401)
    expect(unknown.json()).toEqual(wrong.json())
  })

  it('refuse un compte non confirmé et renvoie le lien', async () => {
    await browser.request('POST', '/auth/signup', { email: 'alex@example.fr', password: PASSWORD })
    const sentBefore = server.mailer.sent.length

    const response = await browser.request('POST', '/auth/login', {
      email: 'alex@example.fr',
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } })
    expect(server.mailer.sent).toHaveLength(sentBefore + 1)
  })

  it('freine les tentatives répétées sur une adresse', async () => {
    const attempts = []
    for (let i = 0; i < 11; i += 1) {
      attempts.push(
        (await browser.request('POST', '/auth/login', { email: EMAIL, password: 'essai au hasard' }))
          .statusCode,
      )
    }

    expect(attempts.slice(0, 10)).toEqual(Array(10).fill(401))
    expect(attempts[10]).toBe(429)
  })

  it('ferme la session à la déconnexion', async () => {
    await browser.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
    await browser.request('POST', '/auth/logout')

    expect(browser.hasSession).toBe(false)
    expect((await browser.request('GET', '/auth/session')).json()).toEqual({ account: null })
  })

  it('expire une session inutilisée pendant 30 jours', async () => {
    await browser.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
    server.advance(30 * 24 * 60 * 60 * 1000 + 1)

    expect((await browser.request('GET', '/auth/session')).json()).toEqual({ account: null })
  })

  it('prolonge une session utilisée', async () => {
    await browser.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
    server.advance(20 * 24 * 60 * 60 * 1000)
    await browser.request('GET', '/auth/session')
    server.advance(20 * 24 * 60 * 60 * 1000)

    expect((await browser.request('GET', '/auth/session')).json()).toMatchObject({
      account: { email: EMAIL },
    })
  })
})

describe('Mot de passe oublié', () => {
  it('répond pareil que l’adresse ait un compte ou non', async () => {
    await registerAndVerify(new TestClient(server.app))
    const sentBefore = server.mailer.sent.length

    const known = await browser.request('POST', '/auth/password/forgot', { email: EMAIL })
    const unknown = await browser.request('POST', '/auth/password/forgot', {
      email: 'personne@example.fr',
    })

    expect(known.statusCode).toBe(202)
    expect(unknown.statusCode).toBe(202)
    expect(known.json()).toEqual(unknown.json())
    expect(server.mailer.sent).toHaveLength(sentBefore + 1)
  })

  it('change le mot de passe et ferme les autres sessions', async () => {
    const laptop = new TestClient(server.app)
    await registerAndVerify(laptop)

    await browser.request('POST', '/auth/password/forgot', { email: EMAIL })
    const reset = await browser.request('POST', '/auth/password/reset', {
      token: server.mailer.lastTokenFor(EMAIL),
      password: 'une nouvelle phrase de passe',
    })

    expect(reset.statusCode).toBe(200)
    expect(browser.hasSession).toBe(true)
    expect((await laptop.request('GET', '/auth/session')).json()).toEqual({ account: null })
    expect(
      (await laptop.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).statusCode,
    ).toBe(401)
  })

  it('confirme l’adresse d’un compte qui ne l’était pas', async () => {
    await browser.request('POST', '/auth/signup', { email: EMAIL, password: PASSWORD })
    await browser.request('POST', '/auth/password/forgot', { email: EMAIL })
    await browser.request('POST', '/auth/password/reset', {
      token: server.mailer.lastTokenFor(EMAIL),
      password: 'une nouvelle phrase de passe',
    })

    const login = await new TestClient(server.app).request('POST', '/auth/login', {
      email: EMAIL,
      password: 'une nouvelle phrase de passe',
    })
    expect(login.statusCode).toBe(200)
  })

  it('périme le lien au bout d’une heure', async () => {
    await registerAndVerify(new TestClient(server.app))
    await browser.request('POST', '/auth/password/forgot', { email: EMAIL })
    server.advance(60 * 60 * 1000 + 1)

    const reset = await browser.request('POST', '/auth/password/reset', {
      token: server.mailer.lastTokenFor(EMAIL),
      password: 'une nouvelle phrase de passe',
    })
    expect(reset.statusCode).toBe(400)
  })
})

describe('Profil rattaché', () => {
  beforeEach(async () => {
    await registerAndVerify(browser)
  })

  it('rattache le profil local au compte, une seule fois', async () => {
    const linked = await browser.request('PUT', '/auth/player', { playerId: 'player-1' })
    const again = await browser.request('PUT', '/auth/player', { playerId: 'player-1' })
    const other = await browser.request('PUT', '/auth/player', { playerId: 'player-2' })

    expect(linked.json()).toMatchObject({ account: { playerId: 'player-1' } })
    expect(again.statusCode).toBe(200)
    expect(other.statusCode).toBe(409)
  })

  it('refuse un profil déjà rattaché à un autre compte', async () => {
    await browser.request('PUT', '/auth/player', { playerId: 'player-1' })
    const alex = new TestClient(server.app)
    await registerAndVerify(alex, 'alex@example.fr')

    const response = await alex.request('PUT', '/auth/player', { playerId: 'player-1' })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: { code: 'PLAYER_ALREADY_LINKED' } })
  })

  it('exige une session', async () => {
    const response = await new TestClient(server.app).request('PUT', '/auth/player', {
      playerId: 'player-1',
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('Suppression du compte', () => {
  beforeEach(async () => {
    await registerAndVerify(browser)
  })

  it('exige le mot de passe', async () => {
    const response = await browser.request('DELETE', '/auth/account', { password: 'pas le bon' })

    expect(response.statusCode).toBe(401)
    expect((await browser.request('GET', '/auth/session')).json()).toMatchObject({
      account: { email: EMAIL },
    })
  })

  it('efface le compte et ses sessions', async () => {
    const response = await browser.request('DELETE', '/auth/account', { password: PASSWORD })

    expect(response.statusCode).toBe(204)
    expect((await browser.request('GET', '/auth/session')).json()).toEqual({ account: null })
    expect(
      (await browser.request('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).statusCode,
    ).toBe(401)
  })
})

describe('Protection intersite', () => {
  it('refuse une mutation venue d’une autre origine', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://site-malveillant.example' },
      payload: { email: EMAIL, password: PASSWORD },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_ORIGIN' } })
  })

  it('refuse un corps qui n’est pas du JSON', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain' },
      payload: 'email=camille',
    })

    expect(response.statusCode).toBe(415)
  })
})
