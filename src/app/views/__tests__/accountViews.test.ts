// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  createFakeContainer,
  failsWith,
  type FakeContainerOverrides,
  succeedsWith,
} from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import ForgotPasswordView from '@/app/views/account/ForgotPasswordView.vue'
import ResetPasswordView from '@/app/views/account/ResetPasswordView.vue'
import SignInView from '@/app/views/account/SignInView.vue'
import SignUpView from '@/app/views/account/SignUpView.vue'
import VerifyEmailView from '@/app/views/account/VerifyEmailView.vue'
import { InvalidEmailError, RemoteRejectedError, WeakPasswordError } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'

const session = {
  accountId: idFrom<'AccountId'>('account-1'),
  email: 'camille@example.fr',
  playerId: null,
}

const blank = { template: '<div />' }
let router: Router

async function mountAt(view: Component, path: string, overrides: FakeContainerOverrides = {}) {
  provideContainer(createFakeContainer(overrides))
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth', name: ROUTE.auth, component: blank },
      { path: '/profil/creation', name: ROUTE.profileSetup, component: blank },
      { path: '/tableau-de-bord', name: ROUTE.dashboard, component: blank },
      { path: '/connexion', name: ROUTE.signIn, component: view },
      { path: '/inscription', name: ROUTE.signUp, component: view },
      { path: '/verifier-email', name: ROUTE.verifyEmail, component: view },
      { path: '/mot-de-passe/oublie', name: ROUTE.forgotPassword, component: view },
      { path: '/mot-de-passe/reinitialiser', name: ROUTE.resetPassword, component: view },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(view, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function fill(wrapper: Awaited<ReturnType<typeof mountAt>>, label: string, value: string) {
  const field = wrapper
    .findAll('label')
    .find((candidate) => candidate.text().startsWith(label))
  const input = wrapper.find(`#${field!.attributes('for')}`)
  await input.setValue(value)
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
  document.body.innerHTML = ''
})

describe('Connexion', () => {
  it('mène à la création du profil quand l’appareil n’en a pas', async () => {
    const signIn = vi.fn(async () => ok(session))
    const wrapper = await mountAt(SignInView, '/connexion', {
      account: { signIn: { execute: signIn } },
    })

    await fill(wrapper, 'Adresse e-mail', 'camille@example.fr')
    await fill(wrapper, 'Mot de passe', 'phrase de passe longue')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(signIn).toHaveBeenCalledWith({
      email: 'camille@example.fr',
      password: 'phrase de passe longue',
    })
    expect(router.currentRoute.value.name).toBe(ROUTE.profileSetup)
  })

  it('affiche un refus du serveur dans le bandeau', async () => {
    const wrapper = await mountAt(SignInView, '/connexion', {
      account: {
        signIn: failsWith(new RemoteRejectedError('INVALID_CREDENTIALS', 'non', 401)),
      },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Adresse ou mot de passe incorrect')
    expect(router.currentRoute.value.name).toBe(ROUTE.signIn)
  })

  it('rattache une adresse mal formée à son champ', async () => {
    const wrapper = await mountAt(SignInView, '/connexion', {
      account: { signIn: failsWith(new InvalidEmailError('mal formée')) },
    })

    await fill(wrapper, 'Adresse e-mail', 'camille')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const input = wrapper.find('input[type="email"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    const describedBy = input.attributes('aria-describedby')!
    expect(wrapper.find(`#${describedBy}`).text()).toContain('Adresse e-mail invalide')
  })

  it('offre un mot de passe affichable', async () => {
    const wrapper = await mountAt(SignInView, '/connexion')
    const toggle = wrapper.find('button[aria-pressed]')

    expect(wrapper.find('input[autocomplete="current-password"]').attributes('type')).toBe(
      'password',
    )
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('input[autocomplete="current-password"]').attributes('type')).toBe('text')
  })
})

describe('Inscription', () => {
  it('annonce l’envoi du lien et y déplace le focus', async () => {
    const wrapper = await mountAt(SignUpView, '/inscription')

    await fill(wrapper, 'Adresse e-mail', ' Camille@Example.fr ')
    await fill(wrapper, 'Mot de passe', 'phrase de passe longue')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const status = wrapper.find('[role="status"]')
    expect(status.text()).toContain('camille@example.fr')
    expect(document.activeElement).toBe(status.element)
  })

  it('rattache un mot de passe trop court à son champ', async () => {
    const wrapper = await mountAt(SignUpView, '/inscription', {
      account: { signUp: failsWith(new WeakPasswordError('trop court')) },
    })

    await fill(wrapper, 'Adresse e-mail', 'camille@example.fr')
    await fill(wrapper, 'Mot de passe', 'court')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('input[autocomplete="new-password"]').attributes('aria-invalid')).toBe(
      'true',
    )
    expect(wrapper.text()).toContain('Mot de passe trop court')
  })
})

describe('Lien de confirmation', () => {
  it('confirme l’adresse puis efface le jeton de la barre d’adresse', async () => {
    const verifyEmail = vi.fn(async () => ok(session))
    const wrapper = await mountAt(VerifyEmailView, '/verifier-email#token=jeton-du-lien', {
      account: { verifyEmail: { execute: verifyEmail } },
    })

    expect(verifyEmail).toHaveBeenCalledWith('jeton-du-lien')
    expect(router.currentRoute.value.hash).toBe('')
    expect(wrapper.text()).toContain('Adresse confirmée')
    expect(wrapper.text()).toContain('camille@example.fr')
  })

  it('explique un lien périmé', async () => {
    const wrapper = await mountAt(VerifyEmailView, '/verifier-email#token=jeton-du-lien', {
      account: {
        verifyEmail: failsWith(new RemoteRejectedError('TOKEN_INVALID', 'périmé', 400)),
      },
    })

    expect(wrapper.find('[role="alert"]').text()).toContain('a déjà servi ou a expiré')
  })

  it('signale un lien incomplet sans appeler le serveur', async () => {
    const verifyEmail = vi.fn()
    const wrapper = await mountAt(VerifyEmailView, '/verifier-email', {
      account: { verifyEmail: { execute: verifyEmail } },
    })

    expect(verifyEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ce lien est incomplet')
  })
})

describe('Mot de passe oublié', () => {
  it('répond au conditionnel', async () => {
    const wrapper = await mountAt(ForgotPasswordView, '/mot-de-passe/oublie')

    await fill(wrapper, 'Adresse e-mail', 'camille@example.fr')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="status"]').text()).toContain('Si un compte existe')
  })
})

describe('Nouveau mot de passe', () => {
  it('enregistre le mot de passe avec le jeton du lien, puis connecte', async () => {
    const resetPassword = vi.fn(async () => ok(session))
    const wrapper = await mountAt(ResetPasswordView, '/mot-de-passe/reinitialiser#token=jeton', {
      account: { resetPassword: { execute: resetPassword } },
    })

    expect(router.currentRoute.value.hash).toBe('')
    await fill(wrapper, 'Nouveau mot de passe', 'une nouvelle phrase')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(resetPassword).toHaveBeenCalledWith({ token: 'jeton', password: 'une nouvelle phrase' })
    expect(router.currentRoute.value.name).toBe(ROUTE.profileSetup)
  })

  it('signale un lien incomplet', async () => {
    const wrapper = await mountAt(ResetPasswordView, '/mot-de-passe/reinitialiser', {
      account: { resetPassword: succeedsWith(session) },
    })

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ce lien est incomplet')
  })
})
