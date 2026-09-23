import { describe, expect, it } from 'vitest'

import { Email } from '@/core/Email'
import { type AccountId, idFrom, type InvitationId } from '@/core/identity'

import { Household, type HouseholdActor } from '../Household'
import { checkHouseholdName, INVITATION_TTL_MS, MAX_MEMBERS } from '../policies'
import { viewHousehold } from '../views'

const at = new Date('2026-09-24T10:00:00Z')
const later = (ms: number): Date => new Date(at.getTime() + ms)

const actor = (name: string): HouseholdActor => ({
  id: idFrom<'AccountId'>(`account-${name}`),
  email: Email.reconstitute(`${name}@example.fr`),
})

const camille = actor('camille')
const alex = actor('alex')
const sacha = actor('sacha')
const invitationId = (n: number): InvitationId => idFrom<'InvitationId'>(`invitation-${n}`)

function founded(): Household {
  const result = Household.found({
    id: idFrom<'HouseholdId'>('household-1'),
    name: '  Les Martin ',
    owner: camille,
    at,
  })
  if (!result.ok) throw result.error
  return result.value
}

function valueOf<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw result.error
  return result.value
}

/** Foyer de Camille où Alex est invité (invitation 1). */
const withInvitation = (): Household =>
  valueOf(founded().invite(camille.id, { id: invitationId(1), email: alex.email, at }))

/** Foyer de Camille qu'Alex a rejoint. */
const withAlex = (): Household => valueOf(withInvitation().accept(invitationId(1), alex, at))

const errorCode = (result: { ok: boolean; error?: { code: string } }): string | undefined =>
  result.ok ? undefined : result.error?.code

describe('Household', () => {
  describe('fondation', () => {
    it('fait du fondateur le propriétaire et le premier membre', () => {
      const household = founded()

      expect(household.name).toBe('Les Martin')
      expect(household.isOwner(camille.id)).toBe(true)
      expect(household.members).toEqual([
        { accountId: camille.id, email: camille.email, joinedAt: at, sharesDays: true },
      ])
    })

    it.each([
      ['', 'vide'],
      ['   ', 'blanc'],
      ['x'.repeat(61), 'trop long'],
    ])('refuse un nom %j (%s)', (name) => {
      const result = Household.found({ id: idFrom('h'), name, owner: camille, at })
      expect(errorCode(result)).toBe('INVALID_HOUSEHOLD_NAME')
    })

    it('accepte un nom de 60 caractères', () => {
      expect(checkHouseholdName('x'.repeat(60)).ok).toBe(true)
    })
  })

  describe('invitation', () => {
    it('attend quatorze jours une réponse', () => {
      const [invitation] = withInvitation().pendingInvitations(at)

      expect(invitation).toMatchObject({ email: alex.email, invitedAt: at })
      expect(invitation?.expiresAt).toEqual(later(INVITATION_TTL_MS))
      expect(withInvitation().pendingInvitations(later(INVITATION_TTL_MS))).toEqual([])
    })

    it('est réservée au propriétaire', () => {
      const result = withAlex().invite(alex.id, { id: invitationId(2), email: sacha.email, at })
      expect(errorCode(result)).toBe('NOT_HOUSEHOLD_OWNER')
    })

    it('ne vise jamais un membre, propriétaire compris', () => {
      expect(
        errorCode(withAlex().invite(camille.id, { id: invitationId(2), email: alex.email, at })),
      ).toBe('ALREADY_HOUSEHOLD_MEMBER')
      expect(
        errorCode(founded().invite(camille.id, { id: invitationId(2), email: camille.email, at })),
      ).toBe('ALREADY_HOUSEHOLD_MEMBER')
    })

    it('n’est pas envoyée deux fois à la même adresse', () => {
      const result = withInvitation().invite(camille.id, { id: invitationId(2), email: alex.email, at })
      expect(errorCode(result)).toBe('ALREADY_INVITED')
    })

    it('peut être renouvelée une fois périmée, et l’ancienne est oubliée', () => {
      const renewedAt = later(INVITATION_TTL_MS + 1)
      const renewed = valueOf(
        withInvitation().invite(camille.id, { id: invitationId(2), email: alex.email, at: renewedAt }),
      )

      expect(renewed.invitations.map((invitation) => invitation.id)).toEqual([invitationId(2)])
    })

    it('compte les invitations en attente dans la limite de membres', () => {
      let household = founded()
      for (let n = 1; n < MAX_MEMBERS; n += 1) {
        household = valueOf(
          household.invite(camille.id, {
            id: invitationId(n),
            email: Email.reconstitute(`invite-${n}@example.fr`),
            at,
          }),
        )
      }

      const result = household.invite(camille.id, { id: invitationId(99), email: sacha.email, at })
      expect(errorCode(result)).toBe('HOUSEHOLD_FULL')
    })
  })

  describe('réponse', () => {
    it('fait entrer la personne invitée, qui partage ses journées', () => {
      const household = withAlex()

      expect(household.memberOf(alex.id)).toEqual({
        accountId: alex.id,
        email: alex.email,
        joinedAt: at,
        sharesDays: true,
      })
      expect(household.invitations).toEqual([])
    })

    it('n’est acceptée qu’avec l’adresse invitée', () => {
      const result = withInvitation().accept(invitationId(1), sacha, at)
      expect(errorCode(result)).toBe('INVITATION_NOT_FOUND')
    })

    it('n’est plus acceptée une fois périmée', () => {
      const result = withInvitation().accept(invitationId(1), alex, later(INVITATION_TTL_MS))
      expect(errorCode(result)).toBe('INVITATION_NOT_FOUND')
    })

    it('refuse un foyer déjà plein', () => {
      let household = founded()
      for (let n = 1; n < MAX_MEMBERS; n += 1) {
        const guest = actor(`membre-${n}`)
        household = valueOf(household.invite(camille.id, { id: invitationId(n), email: guest.email, at }))
        household = valueOf(household.accept(invitationId(n), guest, at))
      }
      // Invitation d'avant la limite, restée en attente dans une base plus ancienne.
      const crowded = Household.reconstitute({
        id: household.id,
        name: household.name,
        ownerId: household.ownerId,
        members: household.members,
        invitations: [
          { id: invitationId(99), email: sacha.email, invitedAt: at, expiresAt: later(1000) },
        ],
        version: 3,
      })

      expect(errorCode(crowded.accept(invitationId(99), sacha, at))).toBe('HOUSEHOLD_FULL')
    })

    it('refusée, l’invitation disparaît sans rien changer d’autre', () => {
      const declined = valueOf(withInvitation().decline(invitationId(1), alex, at))

      expect(declined.invitations).toEqual([])
      expect(declined.members).toHaveLength(1)
      expect(errorCode(withInvitation().decline(invitationId(1), sacha, at))).toBe(
        'INVITATION_NOT_FOUND',
      )
    })
  })

  describe('révocation', () => {
    it('retire l’invitation', () => {
      expect(valueOf(withInvitation().revoke(camille.id, invitationId(1))).invitations).toEqual([])
    })

    it('est réservée au propriétaire et vise une invitation existante', () => {
      expect(errorCode(withAlex().revoke(alex.id, invitationId(1)))).toBe('NOT_HOUSEHOLD_OWNER')
      expect(errorCode(founded().revoke(camille.id, invitationId(1)))).toBe('INVITATION_NOT_FOUND')
    })
  })

  describe('départs', () => {
    it('le propriétaire retire un membre', () => {
      const household = valueOf(withAlex().removeMember(camille.id, alex.id))
      expect(household.memberOf(alex.id)).toBeUndefined()
    })

    it('un membre ne retire personne', () => {
      expect(errorCode(withAlex().removeMember(alex.id, camille.id))).toBe('NOT_HOUSEHOLD_OWNER')
    })

    it('le propriétaire ne se retire pas lui-même', () => {
      expect(errorCode(withAlex().removeMember(camille.id, camille.id))).toBe('OWNER_CANNOT_LEAVE')
    })

    it('un membre quitte le foyer, le propriétaire non', () => {
      expect(valueOf(withAlex().leave(alex.id)).members).toHaveLength(1)
      expect(errorCode(withAlex().leave(camille.id))).toBe('OWNER_CANNOT_LEAVE')
      expect(errorCode(withAlex().leave(sacha.id))).toBe('MEMBER_NOT_FOUND')
    })

    it('seul le propriétaire dissout', () => {
      expect(withAlex().dissolve(camille.id).ok).toBe(true)
      expect(errorCode(withAlex().dissolve(alex.id))).toBe('NOT_HOUSEHOLD_OWNER')
    })
  })

  describe('partage des journées', () => {
    it('se coupe et se rétablit par le membre', () => {
      const off = valueOf(withAlex().setDaySharing(alex.id, false))

      expect(off.memberOf(alex.id)?.sharesDays).toBe(false)
      expect(off.memberOf(camille.id)?.sharesDays).toBe(true)
      expect(valueOf(off.setDaySharing(alex.id, true)).memberOf(alex.id)?.sharesDays).toBe(true)
    })

    it('rend la même instance quand rien ne change', () => {
      const household = withAlex()
      expect(valueOf(household.setDaySharing(alex.id, true))).toBe(household)
    })

    it('ne concerne que les membres', () => {
      expect(errorCode(withAlex().setDaySharing(sacha.id, false))).toBe('MEMBER_NOT_FOUND')
    })
  })

  it('ne modifie jamais l’instance d’origine', () => {
    const original = withInvitation()
    original.accept(invitationId(1), alex, at)

    expect(original.members).toHaveLength(1)
    expect(original.invitations).toHaveLength(1)
  })
})

describe('viewHousehold', () => {
  const household = (): Household =>
    valueOf(
      valueOf(
        withAlex().invite(camille.id, { id: invitationId(2), email: sacha.email, at: later(1) }),
      ).setDaySharing(alex.id, false),
    )

  it('montre au propriétaire les membres, puis les invitations en attente', () => {
    const view = viewHousehold(household(), camille.id, later(2))

    expect(view).toMatchObject({ name: 'Les Martin', role: 'owner', sharesDays: true })
    expect(view?.members.map((member) => [member.email, member.isOwner, member.sharesDays])).toEqual([
      ['camille@example.fr', true, true],
      ['alex@example.fr', false, false],
    ])
    expect(view?.invitations).toEqual([
      { id: invitationId(2), email: 'sacha@example.fr', expiresAt: later(1 + INVITATION_TTL_MS) },
    ])
  })

  it('cache les invitations aux simples membres', () => {
    const view = viewHousehold(household(), alex.id, later(2))

    expect(view).toMatchObject({ role: 'member', sharesDays: false, invitations: [] })
  })

  it('place le propriétaire en tête même s’il est arrivé après', () => {
    const reordered = Household.reconstitute({
      id: idFrom('household-1'),
      name: 'Les Martin',
      ownerId: camille.id,
      members: [
        { accountId: alex.id, email: alex.email, joinedAt: at, sharesDays: true },
        { accountId: camille.id, email: camille.email, joinedAt: later(5), sharesDays: true },
      ],
      invitations: [],
      version: 1,
    })

    expect(viewHousehold(reordered, alex.id, at)?.members[0]?.email).toBe('camille@example.fr')
  })

  it('ne montre rien à qui n’est pas membre', () => {
    expect(viewHousehold(household(), idFrom<'AccountId'>('inconnu') as AccountId, at)).toBeUndefined()
  })
})
