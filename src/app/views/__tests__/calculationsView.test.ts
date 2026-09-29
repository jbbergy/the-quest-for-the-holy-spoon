// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import CalculationsView from '@/app/views/CalculationsView.vue'
import { ROUTE } from '@/app/router'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { playerOf } from '../../sync/__tests__/fixtures'

describe('CalculationsView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('montre le calcul de la personne avec ses propres chiffres', async () => {
    const player = playerOf('player-1')
    usePlayerStore().$patch({ player, status: 'ready' })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: ROUTE.settings, component: { template: '<div />' } }],
    })
    const wrapper = mount(CalculationsView, { global: { plugins: [router] } })
    await flushPromises()

    const text = wrapper.text()
    const rest = Math.round(player.basalMetabolicRate()).toLocaleString('fr-FR')
    const need = Math.round(player.targetCalories()).toLocaleString('fr-FR')
    expect(text).toContain(`${rest} kcal`)
    expect(text).toContain(`${need} kcal par jour`)
    expect(text).toContain('129 kcal')
    expect(wrapper.find('a').attributes('href')).toBe('/')
  })
})
