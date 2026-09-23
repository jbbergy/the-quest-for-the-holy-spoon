// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

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

    expect(wrapper.text()).toContain('Open Food Facts n’a pas répondu')
    expect(wrapper.text()).toContain('code-barres')

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('hors connexion, le dit et ne propose pas une relance vouée à l’échec', () => {
    const wrapper = mountWith(false)

    expect(wrapper.text()).toContain('Hors connexion')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('signale la relance en cours', () => {
    provideContainer(createFakeContainer())
    const wrapper = mount(OnlineSearchNotice, { props: { busy: true } })

    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
  })
})
