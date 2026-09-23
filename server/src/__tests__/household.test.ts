import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Email } from '@/core/Email'
import { idFrom } from '@/core/identity'

import { KyselyHouseholdRepository } from '../modules/household/infrastructure/KyselyHouseholdRepository'

import { signedInClient, TestClient, type TestServer, startTestServer } from './testServer'

const DAY = 24 * 60 * 60 * 1000

let server: TestServer
let camille: TestClient
let alex: TestClient

beforeEach(async () => {
  server = await startTestServer()
  camille = await signedInClient(server, 'camille@example.fr', 'player-camille')
  alex = await signedInClient(server, 'alex@example.fr', 'player-alex')
})

afterEach(async () => {
  await server.close()
})

async function createHousehold(client: TestClient, name = 'Les Martin') {
  const response = await client.request('POST', '/household', { name })
  expect(response.statusCode).toBe(201)
  return response.json().household
}

async function received(client: TestClient) {
  return (await client.request('GET', '/invitations')).json().invitations as {
    id: string
    householdName: string
    invitedBy: string
  }[]
}

/** Camille crée son foyer, invite Alex, qui accepte. */
async function householdWithAlex() {
  await createHousehold(camille)
  await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
  const [invitation] = await received(alex)
  const accepted = await alex.request('POST', `/invitations/${invitation!.id}/accept`)
  expect(accepted.statusCode).toBe(200)
  return accepted.json().household
}

describe('Foyer', () => {
  it('n’existe pas tant qu’on ne l’a pas créé', async () => {
    const response = await camille.request('GET', '/household')
    expect(response.json()).toEqual({ household: null })
  })

  it('fait du créateur son propriétaire', async () => {
    const household = await createHousehold(camille, '  Les Martin  ')

    expect(household).toMatchObject({
      name: 'Les Martin',
      role: 'owner',
      sharesDays: true,
      invitations: [],
      members: [{ email: 'camille@example.fr', isOwner: true, sharesDays: true }],
    })
    expect((await camille.request('GET', '/household')).json().household).toEqual(household)
  })

  it('refuse un nom vide', async () => {
    const response = await camille.request('POST', '/household', { name: '  ' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_HOUSEHOLD_NAME')
  })

  it('est réservé aux comptes connectés', async () => {
    const anonymous = new TestClient(server.app)
    expect((await anonymous.request('GET', '/household')).statusCode).toBe(401)
    expect((await anonymous.request('GET', '/invitations')).statusCode).toBe(401)
  })

  describe('invitation', () => {
    it('prévient la personne invitée par e-mail, avec ce qui sera partagé', async () => {
      await createHousehold(camille)
      const response = await camille.request('POST', '/household/invitations', {
        email: ' Alex@Example.fr ',
      })

      expect(response.statusCode).toBe(202)
      const mail = server.mailer.sent.at(-1)!
      expect(mail.to).toBe('alex@example.fr')
      expect(mail.subject).toContain('Les Martin')
      expect(mail.text).toContain('camille@example.fr vous invite')
      expect(mail.text).toContain('mensurations restent privées')
      expect(mail.text).toContain('http://localhost:5173/foyer')
    })

    it('répond pareil que l’adresse ait un compte ou non', async () => {
      await createHousehold(camille)
      const known = await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const unknown = await camille.request('POST', '/household/invitations', {
        email: 'personne@example.fr',
      })

      expect(unknown.statusCode).toBe(known.statusCode)
      expect(unknown.body).toBe(known.body)
    })

    it('attend qu’un compte soit créé avec l’adresse invitée', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'sacha@example.fr' })

      const sacha = await signedInClient(server, 'sacha@example.fr', 'player-sacha')
      expect(await received(sacha)).toEqual([
        expect.objectContaining({ householdName: 'Les Martin', invitedBy: 'camille@example.fr' }),
      ])
    })

    it('apparaît chez le propriétaire jusqu’à la réponse', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })

      const household = (await camille.request('GET', '/household')).json().household
      expect(household.invitations).toEqual([
        { id: expect.any(String), email: 'alex@example.fr', expiresAt: expect.any(String) },
      ])
    })

    it('refuse une adresse mal formée, un doublon, un membre', async () => {
      await householdWithAlex()

      const codeOf = async (email: string) =>
        (await camille.request('POST', '/household/invitations', { email })).json().error?.code

      expect(await codeOf('pas-une-adresse')).toBe('INVALID_EMAIL')
      expect(await codeOf('alex@example.fr')).toBe('ALREADY_HOUSEHOLD_MEMBER')
      await camille.request('POST', '/household/invitations', { email: 'sacha@example.fr' })
      expect(await codeOf('sacha@example.fr')).toBe('ALREADY_INVITED')
    })

    it('exige d’avoir un foyer', async () => {
      const response = await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('NO_HOUSEHOLD')
    })

    it('est limitée à vingt par jour', async () => {
      await createHousehold(camille)
      for (let n = 0; n < 20; n += 1) {
        await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      }
      const response = await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      expect(response.statusCode).toBe(429)
    })

    it('expire au bout de quatorze jours', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const [invitation] = await received(alex)

      server.advance(14 * DAY)

      expect(await received(alex)).toEqual([])
      const response = await alex.request('POST', `/invitations/${invitation!.id}/accept`)
      expect(response.statusCode).toBe(404)
    })

    it('peut être révoquée par le propriétaire', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const [invitation] = await received(alex)

      const response = await camille.request('DELETE', `/household/invitations/${invitation!.id}`)

      expect(response.json().household.invitations).toEqual([])
      expect(await received(alex)).toEqual([])
    })
  })

  describe('réponse', () => {
    it('l’acceptation fait entrer dans le foyer', async () => {
      const household = await householdWithAlex()

      expect(household).toMatchObject({ role: 'member', sharesDays: true, invitations: [] })
      expect(household.members.map((member: { email: string }) => member.email)).toEqual([
        'camille@example.fr',
        'alex@example.fr',
      ])
      expect(await received(alex)).toEqual([])
    })

    it('le refus retire l’invitation sans rien changer d’autre', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const [invitation] = await received(alex)

      expect((await alex.request('POST', `/invitations/${invitation!.id}/decline`)).statusCode).toBe(204)
      expect(await received(alex)).toEqual([])
      expect((await alex.request('GET', '/household')).json().household).toBeNull()
      expect((await camille.request('GET', '/household')).json().household.invitations).toEqual([])
    })

    it('n’est possible que pour l’adresse invitée', async () => {
      await createHousehold(camille)
      await camille.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const [invitation] = await received(alex)
      const sacha = await signedInClient(server, 'sacha@example.fr', 'player-sacha')

      const accept = await sacha.request('POST', `/invitations/${invitation!.id}/accept`)
      const decline = await sacha.request('POST', `/invitations/${invitation!.id}/decline`)

      expect(accept.statusCode).toBe(404)
      expect(decline.statusCode).toBe(404)
      expect(await received(alex)).toHaveLength(1)
    })

    it('refuse un identifiant qui n’est pas un UUID', async () => {
      const response = await alex.request('POST', '/invitations/pas-un-uuid/accept')
      expect(response.statusCode).toBe(400)
    })

    it('refuse un second foyer : il faut quitter le premier', async () => {
      await householdWithAlex()
      const sacha = await signedInClient(server, 'sacha@example.fr', 'player-sacha')
      await createHousehold(sacha, 'Chez Sacha')
      await sacha.request('POST', '/household/invitations', { email: 'alex@example.fr' })
      const [invitation] = await received(alex)

      const refused = await alex.request('POST', `/invitations/${invitation!.id}/accept`)
      expect(refused.statusCode).toBe(409)
      expect(refused.json().error.code).toBe('ALREADY_IN_HOUSEHOLD')

      await alex.request('POST', '/household/leave')
      const accepted = await alex.request('POST', `/invitations/${invitation!.id}/accept`)
      expect(accepted.json().household.name).toBe('Chez Sacha')
    })

    it('refuse de créer un foyer quand on en a déjà un', async () => {
      await householdWithAlex()
      const response = await alex.request('POST', '/household', { name: 'Le mien' })
      expect(response.json().error.code).toBe('ALREADY_IN_HOUSEHOLD')
    })
  })

  describe('rôles', () => {
    it('un membre n’invite ni ne retire personne, et ne dissout pas', async () => {
      await householdWithAlex()
      const camilleId = (await camille.request('GET', '/household')).json().household.members[0].accountId

      const invite = await alex.request('POST', '/household/invitations', { email: 'sacha@example.fr' })
      const remove = await alex.request('DELETE', `/household/members/${camilleId}`)
      const dissolve = await alex.request('DELETE', '/household')

      for (const response of [invite, remove, dissolve]) {
        expect(response.statusCode).toBe(403)
        expect(response.json().error.code).toBe('NOT_HOUSEHOLD_OWNER')
      }
    })

    it('un membre quitte le foyer', async () => {
      await householdWithAlex()

      expect((await alex.request('POST', '/household/leave')).statusCode).toBe(204)
      expect((await alex.request('GET', '/household')).json().household).toBeNull()
      expect((await camille.request('GET', '/household')).json().household.members).toHaveLength(1)
    })

    it('le propriétaire ne quitte pas : il dissout', async () => {
      await householdWithAlex()

      const leave = await camille.request('POST', '/household/leave')
      expect(leave.statusCode).toBe(409)
      expect(leave.json().error.code).toBe('OWNER_CANNOT_LEAVE')

      expect((await camille.request('DELETE', '/household')).statusCode).toBe(204)
      expect((await camille.request('GET', '/household')).json().household).toBeNull()
      expect((await alex.request('GET', '/household')).json().household).toBeNull()
    })

    it('le propriétaire retire un membre', async () => {
      const household = await householdWithAlex()
      const alexId = household.members[1].accountId

      const response = await camille.request('DELETE', `/household/members/${alexId}`)

      expect(response.json().household.members).toHaveLength(1)
      expect((await alex.request('GET', '/household')).json().household).toBeNull()
    })

    it('supprimer le compte du propriétaire dissout le foyer', async () => {
      await householdWithAlex()
      await camille.request('DELETE', '/auth/account', { password: 'cuillère en bois dorée' })

      expect((await alex.request('GET', '/household')).json().household).toBeNull()
    })

    it('supprimer le compte d’un membre le retire du foyer', async () => {
      await householdWithAlex()
      await alex.request('DELETE', '/auth/account', { password: 'cuillère en bois dorée' })

      expect((await camille.request('GET', '/household')).json().household.members).toHaveLength(1)
    })
  })

  it('chacun coupe et rétablit le partage de ses journées', async () => {
    await householdWithAlex()

    const off = await alex.request('PUT', '/household/sharing', { sharesDays: false })
    expect(off.json().household.sharesDays).toBe(false)

    const seenByOwner = (await camille.request('GET', '/household')).json().household
    expect(seenByOwner.sharesDays).toBe(true)
    expect(seenByOwner.members[1].sharesDays).toBe(false)

    const on = await alex.request('PUT', '/household/sharing', { sharesDays: true })
    expect(on.json().household.sharesDays).toBe(true)
  })
})

describe('KyselyHouseholdRepository', () => {
  it('refuse d’écraser un foyer modifié depuis sa lecture', async () => {
    await householdWithAlex()
    const repository = new KyselyHouseholdRepository(server.db)
    const account = (await camille.request('GET', '/household')).json().household.members[0].accountId
    const ownerId = idFrom<'AccountId'>(account)

    const first = await repository.findByMember(ownerId)
    const second = await repository.findByMember(ownerId)
    const now = new Date()
    const invite = (email: string) =>
      ({ id: idFrom<'InvitationId'>(crypto.randomUUID()), email: Email.reconstitute(email), at: now })

    const a = first!.invite(ownerId, invite('a@example.fr'))
    const b = second!.invite(ownerId, invite('b@example.fr'))

    expect(await repository.save(a.ok ? a.value : first!)).toBe('saved')
    expect(await repository.save(b.ok ? b.value : second!)).toBe('conflict')
    const stored = await repository.findByMember(ownerId)
    expect(stored!.invitations.map((invitation) => invitation.email.value)).toEqual(['a@example.fr'])
  })
})
