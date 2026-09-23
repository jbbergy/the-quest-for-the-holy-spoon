import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { Email } from '@/core/Email'

import { Account } from '../Account'
import { SESSION_TTL_MS, shouldExtendSession } from '../policies'

const pending = (): Account =>
  Account.register({
    id: idFrom<'AccountId'>('account-1'),
    email: Email.reconstitute('camille@example.fr'),
    passwordHash: 'empreinte-1',
  })

const at = new Date('2026-09-23T10:00:00Z')

describe('Account', () => {
  it('naît en attente de confirmation, sans profil', () => {
    const account = pending()

    expect(account.isVerified).toBe(false)
    expect(account.playerId).toBeNull()
  })

  it('garde la date de la première confirmation', () => {
    const verified = pending().verifyEmail(at)
    const again = verified.verifyEmail(new Date('2026-10-01T00:00:00Z'))

    expect(again.emailVerifiedAt).toEqual(at)
    expect(again).toBe(verified)
  })

  it('laisse une nouvelle inscription remplacer le mot de passe tant que l’adresse n’est pas confirmée', () => {
    const original = pending()
    const replaced = original.replacePendingPassword('empreinte-2')

    expect(replaced.ok && replaced.value.passwordHash).toBe('empreinte-2')
    expect(original.passwordHash).toBe('empreinte-1')
  })

  it('refuse ce remplacement une fois l’adresse confirmée', () => {
    const result = pending().verifyEmail(at).replacePendingPassword('empreinte-2')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ACCOUNT_ALREADY_VERIFIED')
  })

  it('confirme l’adresse en réinitialisant le mot de passe', () => {
    const reset = pending().resetPassword('empreinte-2', at)

    expect(reset.passwordHash).toBe('empreinte-2')
    expect(reset.isVerified).toBe(true)
  })

  describe('profil rattaché', () => {
    const player = idFrom<'PlayerId'>('player-1')

    it('se rattache une fois, de façon idempotente', () => {
      const linked = pending().linkPlayer(player)
      if (!linked.ok) throw new Error('rattachement attendu')

      expect(linked.value.playerId).toBe(player)
      expect(linked.value.linkPlayer(player)).toEqual({ ok: true, value: linked.value })
    })

    it('refuse un second profil', () => {
      const linked = pending().linkPlayer(player)
      if (!linked.ok) throw new Error('rattachement attendu')

      const other = linked.value.linkPlayer(idFrom<'PlayerId'>('player-2'))
      expect(other.ok).toBe(false)
      if (!other.ok) expect(other.error.code).toBe('PLAYER_ALREADY_LINKED')
    })
  })
})

describe('shouldExtendSession', () => {
  it('ne prolonge pas une session ouverte depuis moins d’un jour', () => {
    const expiresAt = new Date(at.getTime() + SESSION_TTL_MS - 60_000)
    expect(shouldExtendSession(expiresAt, at)).toBe(false)
  })

  it('prolonge une session plus ancienne', () => {
    const expiresAt = new Date(at.getTime() + SESSION_TTL_MS / 2)
    expect(shouldExtendSession(expiresAt, at)).toBe(true)
  })
})
