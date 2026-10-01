// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
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
      playerId: session.playerId,
      name: 'Camille',
      targetCalories: 2000,
      email: 'camille@example.fr',
      isOwner: true,
      joinedAt: new Date('2026-09-20T10:00:00Z'),
      sharesDays: true,
    },
    {
      accountId: idFrom('account-alex'),
      playerId: idFrom('player-alex'),
      name: null,
      targetCalories: null,
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
      { path: '/garde-manger', name: ROUTE.foods, component: blank },
      { path: '/reglages/profil', name: ROUTE.profileEdit, component: blank },
      { path: '/reglages/calculs', name: ROUTE.calculations, component: blank },
      { path: '/reglages', name: ROUTE.settings, component: path === '/reglages' ? view : blank },
      { path: '/profil/creation', name: ROUTE.profileSetup, component: blank },
      { path: '/connexion', name: ROUTE.signIn, component: path === '/connexion' ? view : blank },
      { path: '/inscription', name: ROUTE.signUp, component: blank },
      { path: '/mot-de-passe/oublie', name: ROUTE.forgotPassword, component: blank },
      { path: '/auth', name: ROUTE.auth, component: blank },
      { path: '/foyer', name: ROUTE.household, component: path === '/foyer' ? view : blank },
      { path: '/foyer/membres/:playerId', name: ROUTE.memberDay, component: blank },
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

/**
 * Les écrans sont montés sur `document.body` : sans démontage, ceux d'un test
 * restent vivants et réagissent aux stores du test suivant.
 */
enableAutoUnmount(afterEach)

afterEach(() => {
  resetContainer()
  document.body.innerHTML = ''
})

describe('Écran Foyer', () => {
  it('sans compte, propose de se connecter puis d’y revenir', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {}, false)

    expect(wrapper.text()).toContain('Il faut un compte pour avoir un foyer')
    await button(wrapper, 'Se connecter').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/connexion?suite=/foyer')
  })

  it('sans foyer, liste les invitations reçues et permet d’en créer un', async () => {
    const create = vi.fn(async () => ok(owned))
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { receivedInvitations: succeedsWith([invitation]), create: { execute: create } },
    })

    expect(wrapper.find('h2').text()).toBe('«\u00A0Chez Sacha\u00A0»')
    expect(wrapper.text()).toContain('sacha@example.fr vous invite à le rejoindre.')

    await fill(wrapper, 'Nom du foyer', 'Les Martin')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(create).toHaveBeenCalledWith('Les Martin')
    expect(wrapper.text()).toContain('Le foyer est créé')
    expect(wrapper.text()).toContain('Les Martin · 2 membres')
  })

  it('mène à l’écran de réponse d’une invitation', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', {
      household: { receivedInvitations: succeedsWith([invitation]) },
    })

    await wrapper.find('a[href="/foyer/invitations/invitation-1"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/foyer/invitations/invitation-1')
  })

  it('montre au propriétaire les membres, les invitations et qui ne partage pas', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer', { household: { get: succeedsWith(owned) } })

    expect(wrapper.text()).toContain('Vous êtes responsable de ce foyer.')
    const members = wrapper.findAll('.members > li')
    expect(members[0]!.text()).toContain('Vous')
    expect(members[0]!.text()).toContain('responsable')
    expect(members[1]!.text()).toContain('alex@example.fr')
    expect(members[1]!.text()).toContain('Ne partage pas sa journée')
    expect(members[1]!.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('sacha@example.fr')
    expect(wrapper.text()).toContain('Supprimer le foyer')
  })

  it('montre ce que chacun a mangé aujourd’hui, s’il partage sa journée', async () => {
    const shared: Household = {
      ...owned,
      members: [owned.members[0]!, { ...owned.members[1]!, name: 'Alex', targetCalories: 1800, sharesDays: true }],
    }
    const meals = vi.fn(async () =>
      ok([
        { calories: 600, consumedAt: '2026-04-10T12:00:00Z' },
        { calories: 900, consumedAt: null },
      ]),
    )
    const wrapper = await mountAt(
      HouseholdView,
      '/foyer',
      {
        household: { get: succeedsWith(shared) },
        memberDays: { meals },
        inventory: {
          journal: succeedsWith({ day: '2026-04-10', meals: [], consumedMeals: [], totalCalories: 1240 }),
        },
      },
    )
    await flushPromises()

    const [mine, alex] = wrapper.findAll('.members > li')
    const spoken = (row: typeof mine) => row!.text().replace(/\s/gu, ' ')
    expect(spoken(mine)).toContain('1 240 kcal mangées sur 2 000')
    expect(mine!.find('a').attributes('href')).toBe('/tableau-de-bord')
    // Le repas seulement prévu ne compte pas.
    expect(spoken(alex)).toContain('600 kcal mangées sur 1 800')
    expect(alex!.find('a').attributes('href')).toBe('/foyer/membres/player-alex')
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
    expect(wrapper.text()).toContain('L’invitation est envoyée à noa@example.fr.')
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

    expect(wrapper.find('[role="alert"]').text()).toContain('Cette personne a déjà une invitation')
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

    expect(wrapper.text()).toContain('Vous faites partie de ce foyer.')
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

    expect(wrapper.find('h1').text()).toBe('Rejoindre «\u00A0Chez Sacha\u00A0»\u00A0?')
    expect(wrapper.text()).toContain('Ce que les autres membres verront')
    expect(wrapper.text()).toContain('Vos repas, prévus et mangés.')
    expect(wrapper.text()).toContain('Ce qui reste privé')
    expect(wrapper.text()).toContain('Votre taille, votre poids et votre âge')
    expect(wrapper.text()).toContain('La liste de courses du foyer.')
    expect(wrapper.find('a[href="/foyer"]').text()).toBe('Retour au foyer')
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

    expect(wrapper.text()).toContain('Vous faites déjà partie du foyer « Les Martin »')
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
    expect(wrapper.text()).toContain('Vous faites partie du foyer « Les Martin ».')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)

    await toggle.setValue(false)
    await flushPromises()

    expect(setDaySharing).toHaveBeenCalledWith(false)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain('Le foyer ne voit plus vos journées.')
  })

  it('n’apparaît pas sans foyer', async () => {
    const wrapper = await mountAt(SettingsView, '/reglages')
    expect(wrapper.find('input[role="switch"]').exists()).toBe(false)
  })
})

describe('Navigation', () => {
  const mountShell = async (signedIn: boolean, overrides: FakeContainerOverrides = {}) => {
    const wrapper = await mountAt(AppShell, '/tableau-de-bord', overrides, signedIn)
    // Sans la césure conditionnelle de « Aujour­d’hui », invisible à l'écran.
    return wrapper.findAll('nav a').map((link) => link.text().replaceAll('\u00ad', ''))
  }

  it('n’offre l’onglet Foyer qu’avec un compte', async () => {
    expect(await mountShell(false)).toEqual(['Aujourd’hui', 'Semaine', 'Garde-manger'])
    setActivePinia(createPinia())
    expect((await mountShell(true))[3]).toContain('Foyer')
  })

  it('signale les invitations en attente, lecteur d’écran compris', async () => {
    const links = await mountShell(true, {
      household: { receivedInvitations: succeedsWith([invitation]) },
    })
    expect(links[3]).toContain('1')
    expect(links[3]).toContain('1 invitation en attente')
  })

  it('ouvre les réglages depuis un bouton nommé, hors des onglets', async () => {
    const wrapper = await mountAt(AppShell, '/tableau-de-bord', {}, false)
    const settings = wrapper.findAll('a').filter((link) => link.attributes('href') === '/reglages')

    // Deux emplacements (en-tête du téléphone, colonne du grand écran), un seul
    // affiché à la fois : chacun porte le mot, pas seulement l'avatar.
    expect(settings.length).toBeGreaterThan(0)
    for (const link of settings) expect(link.text()).toContain('Réglages')
    expect(wrapper.findAll('nav a').map((link) => link.text())).not.toContain('Réglages')
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
