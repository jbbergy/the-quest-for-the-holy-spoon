// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  createFakeContainer,
  type FakeContainerOverrides,
  failsWith,
  succeedsWith,
} from '@/app/__tests__/fakeContainer'
import AppShell from '@/app/components/AppShell.vue'
import { provideContainer, resetContainer } from '@/app/container'
import { returnPath, ROUTE } from '@/app/router'
import HouseholdView from '@/app/views/HouseholdView.vue'
import InvitationView from '@/app/views/InvitationView.vue'
import SettingsView from '@/app/views/SettingsView.vue'
import SignInView from '@/app/views/account/SignInView.vue'
import { RemoteRejectedError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import type { HouseholdView as Household, ReceivedInvitationView } from '@/modules/household/application'
import ConfirmButton from '@/ui/ConfirmButton.vue'

const session = {
  accountId: idFrom<'AccountId'>('account-camille'),
  email: 'camille@example.fr',
  playerId: idFrom<'PlayerId'>('player-camille'),
}

const owned: Household = {
  id: idFrom('household-1'),
  name: 'Les Martin',
  role: 'owner',
  sharesDays: true,
  members: [
    {
      accountId: session.accountId,
      email: 'camille@example.fr',
      isOwner: true,
      joinedAt: new Date('2026-09-20T10:00:00Z'),
      sharesDays: true,
    },
    {
      accountId: idFrom('account-alex'),
      email: 'alex@example.fr',
      isOwner: false,
      joinedAt: new Date('2026-09-21T10:00:00Z'),
      sharesDays: false,
    },
  ],
  invitations: [
    { id: idFrom('invitation-9'), email: 'sacha@example.fr', expiresAt: new Date('2026-10-08T10:00:00Z') },
  ],
}

const joined: Household = { ...owned, role: 'member', invitations: [] }

const invitation: ReceivedInvitationView = {
  id: idFrom('invitation-1'),
  householdName: 'Chez Sacha',
  invitedBy: 'sacha@example.fr',
  expiresAt: new Date('2026-10-08T10:00:00Z'),
}

const blank = { template: '<div />' }
let router: Router

async function mountAt(
  view: Component,
  path: string,
  overrides: FakeContainerOverrides = {},
  signedIn = true,
) {
  provideContainer(createFakeContainer(overrides))
  if (signedIn) useAccountStore().session = session
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tableau-de-bord', name: ROUTE.dashboard, component: blank },
      { path: '/semaine', name: ROUTE.weekPlan, component: blank },
      { path: '/reglages', name: ROUTE.settings, component: path === '/reglages' ? view : blank },
      { path: '/profil/creation', name: ROUTE.profileSetup, component: blank },
      { path: '/connexion', name: ROUTE.signIn, component: path === '/connexion' ? view : blank },
      { path: '/inscription', name: ROUTE.signUp, component: blank },
      { path: '/mot-de-passe/oublie', name: ROUTE.forgotPassword, component: blank },
      { path: '/auth', name: ROUTE.auth, component: blank },
      { path: '/foyer', name: ROUTE.household, component: path === '/foyer' ? view : blank },
      {
        path: '/foyer/invitations/:invitationId',
        name: ROUTE.invitation,
        component: path.startsWith('/foyer/invitations') ? view : blank,
      },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(view, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountAt>>

const button = (wrapper: Wrapper, label: string) => {
  const found = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (found === undefined) throw new Error(`Bouton introuvable : ${label}`)
  return found
}

async function fill(wrapper: Wrapper, label: string, value: string) {
  const field = wrapper.findAll('label').find((candidate) => candidate.text().startsWith(label))
  await wrapper.find(`#${field!.attributes('for')}`).setValue(value)
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
  document.body.innerHTML = ''
})

describe('Écran Foyer', () => {
  it('sans compte, propose de se connecter puis d’y revenir', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {}, false)

    expect(wrapper.text()).toContain('Un foyer demande un compte')
    await button(wrapper, 'Se connecter').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/connexion?suite=/foyer')
  })

  it('sans foyer, liste les invitations reçues et permet d’en créer un', async () => {
    const create = vi.fn(async () => ok(owned))
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { receivedInvitations: succeedsWith([invitation]), create: { execute: create } },
    })

    expect(wrapper.text()).toContain('Chez Sacha')
    expect(wrapper.text()).toContain('de sacha@example.fr')

    await fill(wrapper, 'Nom du foyer', 'Les Martin')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(create).toHaveBeenCalledWith('Les Martin')
    expect(wrapper.text()).toContain('Foyer créé')
    expect(wrapper.find('h2').text()).toBe('Les Martin')
  })

  it('mène à l’écran de réponse d’une invitation', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { receivedInvitations: succeedsWith([invitation]) },
    })

    await button(wrapper, 'Répondre').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/foyer/invitations/invitation-1')
  })

  it('montre au propriétaire les membres, les invitations et qui ne partage pas', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', { household: { get: succeedsWith(owned) } })

    expect(wrapper.text()).toContain('Vous en êtes le propriétaire.')
    expect(wrapper.text()).toContain('propriétaire · vous')
    expect(wrapper.text()).toContain('ne partage pas ses journées')
    expect(wrapper.text()).toContain('sacha@example.fr')
    expect(wrapper.text()).toContain('Dissoudre le foyer')
  })

  it('invite par e-mail et le confirme', async () => {
    const invite = vi.fn(async () => ok(undefined))
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { get: succeedsWith(owned), invite: { execute: invite } },
    })

    await fill(wrapper, 'Adresse e-mail', 'noa@example.fr')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(invite).toHaveBeenCalledWith('noa@example.fr')
    expect(wrapper.text()).toContain('Invitation envoyée à noa@example.fr.')
  })

  it('traduit le refus d’une invitation', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: {
        get: succeedsWith(owned),
        invite: failsWith(new RemoteRejectedError('ALREADY_INVITED', 'déjà', 409)),
      },
    })

    await fill(wrapper, 'Adresse e-mail', 'sacha@example.fr')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Une invitation attend déjà')
  })

  it('ne retire un membre qu’après confirmation', async () => {
    const removeMember = vi.fn(async () => ok({ ...owned, members: [owned.members[0]!] }))
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { get: succeedsWith(owned), removeMember: { execute: removeMember } },
    })

    await button(wrapper, 'Retirer').trigger('click')
    expect(removeMember).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Retirer alex@example.fr du foyer ?')

    const confirm = wrapper.findAll('[data-confirm]')[0]!
    await confirm.trigger('click')
    await flushPromises()

    expect(removeMember).toHaveBeenCalledWith('account-alex')
    expect(wrapper.text()).toContain('alex@example.fr ne fait plus partie du foyer.')
  })

  it('un membre peut quitter le foyer, mais ni inviter ni retirer', async () => {
    const leave = vi.fn(async () => ok(undefined))
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { get: succeedsWith(joined), leave: { execute: leave } },
    })

    expect(wrapper.text()).toContain('Vous en êtes membre.')
    expect(wrapper.text()).not.toContain('Inviter')
    expect(wrapper.findAll('button').some((candidate) => candidate.text() === 'Retirer')).toBe(false)

    await button(wrapper, 'Quitter le foyer').trigger('click')
    await button(wrapper, 'Quitter').trigger('click')
    await flushPromises()

    expect(leave).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Vous avez quitté le foyer.')
    expect(wrapper.text()).toContain('Créer un foyer')
  })

  it('dit quand le serveur est injoignable', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { get: failsWith({ code: 'SERVER_UNREACHABLE', kind: 'remote', message: '' }) },
    })

    expect(wrapper.text()).toContain('Serveur injoignable')
  })
})

describe('Écran d’invitation', () => {
  it('dit ce qui sera partagé et ce qui reste privé, avant toute réponse', async () => {
    const wrapper = await mountAt(InvitationView, '/foyer/invitations/invitation-1', {
      household: { receivedInvitations: succeedsWith([invitation]) },
    })

    expect(wrapper.find('h1').text()).toBe('Rejoindre « Chez Sacha » ?')
    expect(wrapper.text()).toContain('Ce que les membres verront')
    expect(wrapper.text()).toContain('Vos repas, prévus et pris.')
    expect(wrapper.text()).toContain('Ce qui reste privé')
    expect(wrapper.text()).toContain('Vos mensurations')
  })

  it('accepter mène au foyer rejoint', async () => {
    const accept = vi.fn(async () => ok(joined))
    const wrapper = await mountAt(InvitationView, '/foyer/invitations/invitation-1', {
      household: { receivedInvitations: succeedsWith([invitation]), accept: { execute: accept } },
    })

    await button(wrapper, 'Rejoindre le foyer').trigger('click')
    await flushPromises()

    expect(accept).toHaveBeenCalledWith('invitation-1')
    expect(router.currentRoute.value.name).toBe(ROUTE.household)
  })

  it('refuser ramène au foyer', async () => {
    const decline = vi.fn(async () => ok(undefined))
    const wrapper = await mountAt(InvitationView, '/foyer/invitations/invitation-1', {
      household: { receivedInvitations: succeedsWith([invitation]), decline: { execute: decline } },
    })

    await button(wrapper, 'Refuser').trigger('click')
    await flushPromises()

    expect(decline).toHaveBeenCalledWith('invitation-1')
    expect(router.currentRoute.value.name).toBe(ROUTE.household)
  })

  it('explique pourquoi on ne peut pas accepter quand on a déjà un foyer', async () => {
    const accept = vi.fn(async () => ok(joined))
    const wrapper = await mountAt(InvitationView, '/foyer/invitations/invitation-1', {
      household: {
        get: succeedsWith(joined),
        receivedInvitations: succeedsWith([invitation]),
        accept: { execute: accept },
      },
    })

    expect(wrapper.text()).toContain('Vous faites déjà partie de « Les Martin »')
    await button(wrapper, 'Rejoindre le foyer').trigger('click')
    expect(accept).not.toHaveBeenCalled()
  })

  it('dit qu’une invitation inconnue n’existe plus', async () => {
    const wrapper = await mountAt(InvitationView, '/foyer/invitations/disparue')
    expect(wrapper.text()).toContain('Cette invitation n’existe plus')
  })
})

describe('Réglages du foyer', () => {
  it('coupe le partage des journées', async () => {
    const setDaySharing = vi.fn(async () => ok({ ...joined, sharesDays: false }))
    const wrapper = await mountAt(SettingsView, '/reglages', {
      household: { get: succeedsWith(joined), setDaySharing: { execute: setDaySharing } },
    })

    const toggle = wrapper.find('input[role="switch"]')
    expect(wrapper.text()).toContain('Vous faites partie de « Les Martin ».')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)

    await toggle.setValue(false)
    await flushPromises()

    expect(setDaySharing).toHaveBeenCalledWith(false)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain('Vos journées ne sont plus visibles par le foyer.')
  })

  it('n’apparaît pas sans foyer', async () => {
    const wrapper = await mountAt(SettingsView, '/reglages')
    expect(wrapper.find('input[role="switch"]').exists()).toBe(false)
  })
})

describe('Navigation', () => {
  const mountShell = async (signedIn: boolean, overrides: FakeContainerOverrides = {}) => {
    const wrapper = await mountAt(AppShell, '/tableau-de-bord', overrides, signedIn)
    return wrapper.findAll('nav a').map((link) => link.text())
  }

  it('n’offre l’onglet Foyer qu’avec un compte', async () => {
    expect(await mountShell(false)).toEqual(['◎Accueil', '▦Semaine', '⚙Réglages'])
    setActivePinia(createPinia())
    expect((await mountShell(true))[2]).toContain('Foyer')
  })

  it('signale les invitations en attente, lecteur d’écran compris', async () => {
    const links = await mountShell(true, {
      household: { receivedInvitations: succeedsWith([invitation]) },
    })
    expect(links[2]).toContain('1')
    expect(links[2]).toContain('1 invitation en attente')
  })
})

describe('Connexion depuis un lien', () => {
  it('ne suit qu’un chemin interne', () => {
    expect(returnPath('/foyer')).toBe('/foyer')
    expect(returnPath('//exemple.com')).toBeNull()
    expect(returnPath('https://exemple.com')).toBeNull()
    expect(returnPath(['/foyer'])).toBeNull()
  })

  it('ramène à la page d’origine une fois connecté', async () => {
    const wrapper = await mountAt(
      SignInView,
      '/connexion',
      {
        account: { signIn: succeedsWith(session) },
        profile: { getCurrent: succeedsWith(null) },
      },
      false,
    )
    await router.replace('/connexion?suite=/foyer')
    // Un profil existe sur l'appareil : pas d'onboarding à faire.
    const { usePlayerStore } = await import('@/modules/player_profile/presentation/usePlayerStore')
    usePlayerStore().$patch({ player: { id: 'player-camille' } as never })

    await fill(wrapper, 'Adresse e-mail', 'camille@example.fr')
    await fill(wrapper, 'Mot de passe', 'cuillère en bois dorée')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/foyer')
  })
})

describe('ConfirmButton', () => {
  it('déplace le focus sur la confirmation, puis le rend au bouton', async () => {
    const wrapper = mount(ConfirmButton, {
      props: { question: 'Supprimer ?', confirmLabel: 'Supprimer' },
      slots: { default: 'Supprimer…' },
      attachTo: document.body,
    })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(document.activeElement?.hasAttribute('data-confirm')).toBe(true)
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Supprimer ?')

    await button(wrapper as unknown as Wrapper, 'Annuler').trigger('click')
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('Supprimer…')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('émet la confirmation', async () => {
    const wrapper = mount(ConfirmButton, {
      props: { question: 'Supprimer ?', confirmLabel: 'Oui' },
      slots: { default: 'Supprimer…' },
    })

    await wrapper.find('button').trigger('click')
    await button(wrapper as unknown as Wrapper, 'Oui').trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
