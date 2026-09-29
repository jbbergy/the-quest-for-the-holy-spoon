// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import FoodPicker from '@/app/components/FoodPicker.vue'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'

/** Monte le sélecteur, lance une recherche et attend son résultat. */
async function searchWith(onlineSearched: boolean): Promise<VueWrapper> {
  provideContainer(
    createFakeContainer({
      inventory: {
        find: succeedsWith({ kind: 'by_name', items: [], excluded: [], onlineSearched }),
      } as never,
    }),
  )

  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/aliments/nouveau', name: ROUTE.customFood, component: blank },
    ],
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(FoodPicker, {
    props: { add: async () => true },
    global: { plugins: [router] },
  })
  await wrapper.get('input').setValue('skyr')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('FoodPicker — recherche sans résultat', () => {
  it('Open Food Facts a répondu : « aucun aliment trouvé », sans bandeau', async () => {
    const wrapper = await searchWith(true)

    expect(wrapper.text()).toContain('Aucun aliment trouvé.')
    expect(wrapper.text()).not.toContain('ne répond pas')
  })

  it('Open Food Facts n’a pas répondu : ne le fait pas passer pour une absence', async () => {
    // Le 503 d'Open Food Facts ne doit pas se lire « ce produit n'existe pas » :
    // seul le catalogue public a été consulté.
    const wrapper = await searchWith(false)

    expect(wrapper.text()).toContain('La recherche des produits de marque ne répond pas')
    expect(wrapper.text()).toContain('Aucun aliment trouvé dans le catalogue public.')
    expect(wrapper.text()).toContain('Les produits de marque n’ont pas pu être cherchés.')
    expect(wrapper.text()).not.toContain('Aucun aliment trouvé.')
  })
})
