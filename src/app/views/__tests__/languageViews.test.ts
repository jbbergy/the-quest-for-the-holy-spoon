// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createFakeContainer } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { setPageTitle } from '@/app/pageTitle'
import { ROUTE } from '@/app/router'
import SettingsView from '@/app/views/SettingsView.vue'
import { setCurrentLocale } from '@/i18n'
import { InMemoryLocalePreference } from '@/i18n/LocalePreference'
import { useLocaleStore } from '@/i18n/useLocaleStore'
import { routeTitle } from '@/app/pageTitle'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { playerOf } from '../../sync/__tests__/fixtures'

const blank = { template: '<div />' }
let device: string[]
let preference: InMemoryLocalePreference

async function mountSettings() {
  provideContainer(createFakeContainer())
  const locale = useLocaleStore()
  locale.configure({ preference, deviceLanguages: () => device })
  locale.initialize()
  usePlayerStore().$patch({ player: playerOf('player-1'), status: 'ready' })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: ROUTE.settings, component: blank }],
  })
  await router.push('/')
  const wrapper = mount(SettingsView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const languageChoices = (wrapper: Awaited<ReturnType<typeof mountSettings>>) =>
  wrapper.findAll('input[name="locale"]')

beforeEach(() => {
  setActivePinia(createPinia())
  preference = new InMemoryLocalePreference()
  device = ['fr-FR']
})

afterEach(() => {
  resetContainer()
  document.body.innerHTML = ''
  document.documentElement.lang = ''
  setCurrentLocale('fr')
  setPageTitle('')
})

describe('choix de la langue dans les réglages', () => {
  it('propose « automatique », le français et l’anglais, automatique étant choisi au départ', async () => {
    const wrapper = await mountSettings()

    const choices = languageChoices(wrapper)
    expect(choices.map((choice) => choice.attributes('value'))).toEqual(['auto', 'fr', 'en'])
    expect(choices.map((choice) => (choice.element as HTMLInputElement).checked)).toEqual([
      true,
      false,
      false,
    ])
    expect(wrapper.text()).toContain('Suit la langue de l’appareil : Français.')
  })

  it('dit quelle langue « automatique » donne sur cet appareil', async () => {
    device = ['en-US']
    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('Follows the device language: English.')
    expect(wrapper.find('h1').text()).toBe('Settings')
  })

  it('traduit tout l’écran dès qu’une langue est choisie, sans rechargement', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.find('h1').text()).toBe('Réglages')

    await languageChoices(wrapper)[2]!.setValue(true)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.text()).toContain('My profile')
    expect(wrapper.text()).toContain('Start of the day')
    expect(document.documentElement.lang).toBe('en')
    expect(preference.read()).toBe('en')
  })

  it('garde la langue choisie même si l’appareil parle l’autre', async () => {
    device = ['en-US']
    const wrapper = await mountSettings()
    expect(wrapper.find('h1').text()).toBe('Settings')

    await languageChoices(wrapper)[1]!.setValue(true)
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Réglages')

    useLocaleStore().followDevice()
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Réglages')
  })

  it('revient à la langue de l’appareil avec « automatique »', async () => {
    device = ['en-US']
    preference.write('fr')
    const wrapper = await mountSettings()
    expect(wrapper.find('h1').text()).toBe('Réglages')

    await languageChoices(wrapper)[0]!.setValue(true)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(preference.read()).toBeNull()
  })

  it('traduit aussi les thèmes de couleurs', async () => {
    device = ['en-US']
    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('High contrast')
    expect(wrapper.text()).toContain('Dusk')
  })
})

describe('titre de la page', () => {
  it('suit la langue sans que l’écran ait à le redemander', async () => {
    setPageTitle(() => routeTitle({ title: 'shell.titles.week' }))
    expect(document.title).toBe('Semaine · Holy Spoon')

    setCurrentLocale('en')
    expect(document.title).toBe('Week · Holy Spoon')
  })

  it('prend telle quelle une valeur qui n’est pas une clé de traduction', () => {
    expect(routeTitle({ title: 'Accueil' })).toBe('Accueil')
    expect(routeTitle({})).toBe('')
  })
})
