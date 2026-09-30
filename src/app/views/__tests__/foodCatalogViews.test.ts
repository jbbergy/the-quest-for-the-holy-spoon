// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import CustomFoodView from '@/app/views/CustomFoodView.vue'
import FoodCatalogView from '@/app/views/FoodCatalogView.vue'
import FoodDetailView from '@/app/views/FoodDetailView.vue'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import {
  BrowseCustomFoodsUseCase,
  CreateCustomFoodUseCase,
  DeleteFoodUseCase,
  GetFoodUseCase,
  UpdateCustomFoodUseCase,
} from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { InMemoryFoodRepository } from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'
import { useHouseholdStore } from '@/modules/household/presentation/useHouseholdStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { playerOf } from '../../sync/__tests__/fixtures'

const me: PlayerId = idFrom('player-1')

const food = (id: string, name: string, source: FoodSource, ownerId: PlayerId | null = null): FoodItem =>
  FoodItem.reconstitute({
    id: idFrom(id),
    name,
    macrosPer100g: Macros.reconstitute({ proteinG: 5, carbsG: 40, fatG: 15 }),
    source,
    ownerId,
    servings: [{ label: 'part', grams: 120, approximate: false }],
  })

const tart = food('user:tarte', 'Tarte de mamie', FoodSource.USER, me)
const cake = food('user:cake', 'Cake d’Alex', FoodSource.USER, idFrom('player-alex'))
const rice = food('ciqual:9100', 'Riz cuit', FoodSource.CIQUAL)
const nutella = food('off:nutella', 'Nutella', FoodSource.OPEN_FOOD_FACTS)

let foods: InMemoryFoodRepository
let router: Router

async function mountAt(view: object, path: string): Promise<VueWrapper> {
  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(playerOf('player-1')) } as never,
      inventory: {
        browseCustomFoods: new BrowseCustomFoodsUseCase(foods),
        getFood: new GetFoodUseCase(foods),
        updateCustomFood: new UpdateCustomFoodUseCase(foods),
        deleteFood: new DeleteFoodUseCase(foods),
        createCustomFood: new CreateCustomFoodUseCase(foods),
      } as never,
    }),
  )
  await usePlayerStore().load()

  const blank = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reglages', name: ROUTE.settings, component: blank },
      { path: '/garde-manger', name: ROUTE.foods, component: blank },
      { path: '/garde-manger/recettes', name: ROUTE.recipes, component: blank },
      { path: '/garde-manger/aliments/nouveau', name: ROUTE.customFood, component: blank },
      { path: '/garde-manger/aliments/:foodId', name: ROUTE.foodDetail, component: blank },
      { path: '/garde-manger/aliments/:foodId/modifier', name: ROUTE.foodEdit, component: blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: blank },
      { path: '/semaine/courses', name: ROUTE.shoppingList, component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(view, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const buttonNamed = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((button) => button.text().includes(text))

beforeEach(async () => {
  setActivePinia(createPinia())
  foods = new InMemoryFoodRepository()
  await foods.saveMany([tart, cake, rice, nutella])
})

afterEach(() => {
  resetContainer()
})

describe('FoodCatalogView', () => {
  const names = (wrapper: VueWrapper) => wrapper.findAll('.catalog__name').map((name) => name.text())

  it('ne liste que les aliments saisis à la main, les siens comme ceux du foyer', async () => {
    const wrapper = await mountAt(FoodCatalogView, '/garde-manger')

    expect(names(wrapper)).toEqual(['Cake d’Alex', 'Tarte de mamie'])
    expect(wrapper.find('a.catalog__item').attributes('href')).toBe('/garde-manger/aliments/user:cake')
  })

  it('cherche à la frappe, et garde le terme dans l’adresse', async () => {
    const wrapper = await mountAt(FoodCatalogView, '/garde-manger')

    await wrapper.find('.catalog__search input').setValue('tarte')
    await new Promise((resolve) => setTimeout(resolve, 250))
    await flushPromises()

    expect(names(wrapper)).toEqual(['Tarte de mamie'])
    expect(router.currentRoute.value.query).toEqual({ q: 'tarte' })
  })

  it('ne propose pas de filtre sans foyer : tout est à soi', async () => {
    const wrapper = await mountAt(FoodCatalogView, '/garde-manger')

    expect(wrapper.find('.catalog__filters').exists()).toBe(false)
  })

  it('sépare ses aliments de ceux du foyer', async () => {
    useHouseholdStore().household = {
      id: idFrom('household-1'),
      name: 'Les Martin',
      members: [{ playerId: idFrom('player-alex'), name: 'Alex' }],
    } as never
    const wrapper = await mountAt(FoodCatalogView, '/garde-manger')
    const choose = async (label: string) => {
      const option = wrapper.findAll('.chip').find((chip) => chip.text() === label)
      await option!.find('input').setValue(true)
    }

    await choose('Les miens')
    expect(names(wrapper)).toEqual(['Tarte de mamie'])

    await choose('Du foyer')
    expect(names(wrapper)).toEqual(['Cake d’Alex'])

    await choose('Tous')
    expect(names(wrapper)).toEqual(['Cake d’Alex', 'Tarte de mamie'])
  })

  it('retrouve la dernière recherche en revenant sans paramètre', async () => {
    const first = await mountAt(FoodCatalogView, '/garde-manger?q=tarte')
    expect((first.find('.catalog__search input').element as HTMLInputElement).value).toBe('tarte')
    first.unmount()

    const wrapper = await mountAt(FoodCatalogView, '/garde-manger')

    expect(names(wrapper)).toEqual(['Tarte de mamie'])
    expect(router.currentRoute.value.query).toEqual({ q: 'tarte' })
  })
})

describe('FoodDetailView', () => {
  it('permet de modifier et de supprimer son aliment', async () => {
    const wrapper = await mountAt(FoodDetailView, `/garde-manger/aliments/${tart.id}`)

    expect(wrapper.find('h1').text()).toBe('Tarte de mamie')
    expect(wrapper.text()).toContain('1 part')
    expect(buttonNamed(wrapper, 'Modifier')).toBeDefined()

    await buttonNamed(wrapper, 'Supprimer')!.trigger('click')
    await wrapper.find('[data-confirm]').trigger('click')
    await flushPromises()

    expect(await foods.findById(tart.id)).toEqual({ ok: true, value: null })
    expect(router.currentRoute.value.name).toBe(ROUTE.foods)
  })

  it('montre en lecture seule l’aliment d’un autre membre', async () => {
    const wrapper = await mountAt(FoodDetailView, `/garde-manger/aliments/${cake.id}`)

    expect(buttonNamed(wrapper, 'Modifier')).toBeUndefined()
    expect(buttonNamed(wrapper, 'Supprimer')).toBeUndefined()
    expect(wrapper.text()).toContain('Seule cette personne peut le modifier')
  })

  it('montre une fiche de référence en lecture seule', async () => {
    const wrapper = await mountAt(FoodDetailView, `/garde-manger/aliments/${rice.id}`)

    expect(buttonNamed(wrapper, 'Modifier')).toBeUndefined()
    expect(buttonNamed(wrapper, 'Supprimer')).toBeUndefined()
    expect(wrapper.text()).toContain('vient d’un catalogue')
  })

  it('dit quand la fiche n’existe plus', async () => {
    const wrapper = await mountAt(FoodDetailView, '/garde-manger/aliments/disparu')

    expect(wrapper.text()).toContain('Cet aliment n’existe plus')
  })
})

describe('CustomFoodView — modification', () => {
  const field = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll('.field').find((candidate) => candidate.find('label').text().startsWith(label))!.find('input')

  it('préremplit son aliment et enregistre la correction', async () => {
    const wrapper = await mountAt(CustomFoodView, `/garde-manger/aliments/${tart.id}/modifier`)

    expect(wrapper.find('h1').text()).toBe('Modifier l’aliment')
    expect((field(wrapper, 'Nom de l’aliment').element as HTMLInputElement).value).toBe('Tarte de mamie')
    expect((field(wrapper, 'Nom de la portion 1').element as HTMLInputElement).value).toBe('part')

    await field(wrapper, 'Nom de l’aliment').setValue('Tarte de mamie, moins sucrée')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const saved = await foods.findById(tart.id)
    expect(saved.ok && saved.value?.name).toBe('Tarte de mamie, moins sucrée')
    expect(saved.ok && saved.value?.ownerId).toBe(me)
    expect(router.currentRoute.value.fullPath).toBe(`/garde-manger/aliments/${tart.id}`)
  })

  it('refuse de modifier l’aliment d’un autre membre', async () => {
    const wrapper = await mountAt(CustomFoodView, `/garde-manger/aliments/${cake.id}/modifier`)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Vous ne pouvez pas modifier cet aliment')
  })

})

describe('CustomFoodView — création', () => {
  it('revient à la liste de courses d’où l’on vient, l’aliment présélectionné', async () => {
    const back = encodeURIComponent('/semaine/courses?semaine=2026-09-28')
    const wrapper = await mountAt(CustomFoodView, `/garde-manger/aliments/nouveau?retour=${back}`)

    const name = wrapper
      .findAll('.field')
      .find((candidate) => candidate.find('label').text().startsWith('Nom de l’aliment'))!
      .find('input')
    await name.setValue('Galettes de sarrasin')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const route = router.currentRoute.value
    expect(route.name).toBe(ROUTE.shoppingList)
    expect(route.query.semaine).toBe('2026-09-28')
    expect(typeof route.query.aliment).toBe('string')
  })
})
