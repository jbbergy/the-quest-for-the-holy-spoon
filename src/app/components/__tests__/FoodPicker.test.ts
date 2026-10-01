// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import FoodPicker from '@/app/components/FoodPicker.vue'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'

const foodOf = (id: string, name: string, source: string) =>
  FoodItem.reconstitute({
    id: idFrom(id),
    name,
    macrosPer100g: Macros.reconstitute({ proteinG: 4, carbsG: 5, fatG: 3 }),
    source: source as FoodSource,
  })

/** Monte le sélecteur, lance une recherche et attend son résultat. */
async function searchWith(
  onlineSearched: boolean,
  items: readonly FoodItem[] = [],
  add: () => Promise<boolean> = async () => true,
): Promise<VueWrapper> {
  provideContainer(
    createFakeContainer({
      inventory: {
        find: succeedsWith({ kind: 'by_name', items, excluded: [], onlineSearched }),
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
    props: { add },
    global: { plugins: [router] },
    attachTo: document.body,
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
  document.body.innerHTML = ''
})

describe('FoodPicker — aide', () => {
  it('explique les trois mots de la phrase d’aide dans une seule bulle', async () => {
    const wrapper = await searchWith(true)
    const tips = wrapper.findAll('.picker__note .tip__button')

    expect(tips).toHaveLength(1)
    expect(tips[0]!.attributes('aria-label')).toBe('Explication : la recherche')

    await tips[0]!.trigger('click')
    const bubble = wrapper.get('.picker__note .tip__bubble').text()
    expect(bubble).toContain('Code-barres : ')
    expect(bubble).toContain('Catalogue public : ')
    expect(bubble).toContain('Produits de marque : ')
  })
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

describe('FoodPicker — résultats', () => {
  const yaourts = [
    foodOf('nature', 'Yaourt nature', FoodSource.CIQUAL),
    foodOf('entier', 'Yaourt au lait entier', FoodSource.CIQUAL),
    foodOf('marque', 'Yaourt de marque', FoodSource.OPEN_FOOD_FACTS),
  ]

  it('filtre par provenance quand les résultats en mêlent plusieurs', async () => {
    const wrapper = await searchWith(true, yaourts)
    const names = () => wrapper.findAll('.picker__name').map((name) => name.text())

    const chips = wrapper.findAll('.chip__label').map((chip) => chip.text())
    expect(chips).toEqual(['Tout', 'Catalogue public', 'Produits de marque'])

    await wrapper.findAll('.chip__input')[2]!.setValue(true)
    expect(names()).toEqual(['Yaourt de marque'])
  })

  it('n’offre pas de filtre qui ne trierait rien', async () => {
    const wrapper = await searchWith(true, yaourts.slice(0, 2))
    expect(wrapper.find('.chip').exists()).toBe(false)
  })

  it('montre les résultats par paquets', async () => {
    const many = Array.from({ length: 11 }, (_, i) => foodOf(`f${i}`, `Aliment ${i}`, FoodSource.CIQUAL))
    const wrapper = await searchWith(true, many)

    expect(wrapper.findAll('.picker__item')).toHaveLength(8)
    const more = wrapper.findAll('button').find((button) => button.text() === 'Afficher 3 de plus')!
    await more.trigger('click')
    expect(wrapper.findAll('.picker__item')).toHaveLength(11)
  })

  it('ouvre la portion sous l’aliment, puis rend le focus à son bouton une fois ajouté', async () => {
    const add = vi.fn(async () => true)
    const wrapper = await searchWith(true, yaourts, add)
    const toggle = wrapper.get('[data-food="nature"]')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const panel = wrapper.get(`#${toggle.attributes('aria-controls')}`)
    expect(panel.find('.portion').exists()).toBe(true)

    await panel.findAll('button').find((button) => button.text() === 'Ajouter Yaourt nature')!.trigger('click')
    await flushPromises()

    expect(add).toHaveBeenCalledOnce()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)
  })
})
