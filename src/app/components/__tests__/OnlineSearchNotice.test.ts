// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { createFakeContainer } from '@/app/__tests__/fakeContainer'
import OnlineSearchNotice from '@/app/components/OnlineSearchNotice.vue'
import { provideContainer, resetContainer } from '@/app/container'
import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'

const mountWith = (online: boolean) => {
  provideContainer({ ...createFakeContainer(), network: new StaticNetworkStatus(online) })
  return mount(OnlineSearchNotice, { props: { busy: false } })
}

afterEach(() => {
  resetContainer()
})

describe('OnlineSearchNotice', () => {
  it('en ligne, dit que le service n’a pas répondu et propose de relancer', async () => {
    const wrapper = mountWith(true)

    expect(wrapper.text()).toContain('La recherche des produits de marque ne répond pas')
    expect(wrapper.text()).toContain('code-barres')

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('hors connexion, le dit et ne propose pas une relance vouée à l’échec', () => {
    const wrapper = mountWith(false)

    expect(wrapper.text()).toContain('pas connecté à Internet')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('quand la connexion revient, le dit et propose de relancer', async () => {
    const network = new StaticNetworkStatus(false)
    provideContainer({ ...createFakeContainer(), network })
    const wrapper = mount(OnlineSearchNotice, { props: { busy: false } })

    network.set(true)
    await nextTick()

    expect(wrapper.text()).toContain('La connexion est revenue')
    expect(wrapper.text()).not.toContain('code-barres')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('une relance qui échoue en ligne reprend le message du service surchargé', async () => {
    const network = new StaticNetworkStatus(false)
    provideContainer({ ...createFakeContainer(), network })
    const wrapper = mount(OnlineSearchNotice, { props: { busy: false } })

    network.set(true)
    await wrapper.setProps({ busy: true })
    await wrapper.setProps({ busy: false })

    expect(wrapper.text()).toContain('La recherche des produits de marque ne répond pas')
  })

  it('si la connexion tombe, retire la relance', async () => {
    const network = new StaticNetworkStatus(true)
    provideContainer({ ...createFakeContainer(), network })
    const wrapper = mount(OnlineSearchNotice, { props: { busy: false } })

    network.set(false)
    await nextTick()

    expect(wrapper.text()).toContain('pas connecté à Internet')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('signale la relance en cours', () => {
    provideContainer(createFakeContainer())
    const wrapper = mount(OnlineSearchNotice, { props: { busy: true } })

    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
  })
})
