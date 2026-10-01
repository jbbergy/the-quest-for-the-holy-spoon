// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import RecipeDetailView from '@/app/views/RecipeDetailView.vue'
import RecipeListView from '@/app/views/RecipeListView.vue'
import { idFrom } from '@/core/identity'
import { Quantity } from '@/core/nutrition/Quantity'
import {
  ChangeRecipeLineQuantityUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  ListRecipesUseCase,
  RemoveRecipeLineUseCase,
  RenameRecipeUseCase,
} from '@/modules/nutrition_inventory/application'
import { GRAM } from '@/modules/nutrition_inventory/domain/Measure'
import { Recipe } from '@/modules/nutrition_inventory/domain/Recipe'
import { InMemoryRecipeRepository } from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { playerOf } from '../../sync/__tests__/fixtures'

const me = idFrom<'PlayerId'>('player-1')
const slice = { label: 'tranche', grams: 25, countable: true, approximate: true }

const line = (id: string, name: string, grams: number, measure = GRAM) => ({
  foodItemId: idFrom<'FoodItemId'>(id),
  foodName: name,
  quantity: Quantity.reconstitute(grams),
  measure,
})

const create = (name: string, lines: ReturnType<typeof line>[]): Recipe => {
  const made = Recipe.create({ playerId: me, name, lines })
  if (!made.ok) throw made.error
  return made.value
}

let recipes: InMemoryRecipeRepository
let router: Router

async function mountAt(view: object, path: string): Promise<VueWrapper> {
  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(playerOf('player-1')) } as never,
      inventory: {
        listRecipes: new ListRecipesUseCase(recipes),
        getRecipe: new GetRecipeUseCase(recipes),
        renameRecipe: new RenameRecipeUseCase(recipes),
        changeRecipeLine: new ChangeRecipeLineQuantityUseCase(recipes),
        removeRecipeLine: new RemoveRecipeLineUseCase(recipes),
        deleteRecipe: new DeleteRecipeUseCase(recipes),
      } as never,
    }),
  )
  await usePlayerStore().load()

  const blank = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reglages', name: ROUTE.settings, component: blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: blank },
      { path: '/garde-manger', name: ROUTE.foods, component: blank },
      { path: '/garde-manger/recettes', name: ROUTE.recipes, component: RecipeListView },
      { path: '/garde-manger/recettes/:recipeId', name: ROUTE.recipeDetail, component: RecipeDetailView },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(view, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(async () => {
  setActivePinia(createPinia())
  recipes = new InMemoryRecipeRepository()
  await recipes.save(create('Toast', [line('a', 'Pain de mie', 50, slice), line('b', 'Beurre', 10)]))
  await recipes.save(create('Poke bowl', [line('c', 'Riz', 150), line('d', 'Saumon', 100)]))
})

afterEach(() => {
  resetContainer()
})

const idOf = async (name: string) => {
  const found = await recipes.findByPlayer(me)
  if (!found.ok) throw found.error
  return found.value.find((recipe) => recipe.name === name)!.id
}

const savedToast = async (): Promise<Recipe> => {
  const found = await recipes.findById(await idOf('Toast'))
  if (!found.ok || found.value === null) throw new Error('recette introuvable')
  return found.value
}

const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.text().startsWith(label))!

describe('RecipeListView', () => {
  it('liste les recettes par ordre alphabétique, avec leurs aliments', async () => {
    const wrapper = await mountAt(RecipeListView, '/garde-manger/recettes')

    const names = wrapper.findAll('.recipes__name').map((n) => n.text())
    expect(names).toEqual(['Poke bowl', 'Toast'])
    expect(wrapper.text()).toContain('2 aliments\u00A0: Pain de mie (2 tranches), Beurre (10 g)')
  })

  it('mène à la fiche de la recette', async () => {
    const wrapper = await mountAt(RecipeListView, '/garde-manger/recettes')

    await wrapper.findAll('.recipes__item')[0]!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(ROUTE.recipeDetail)
    expect(router.currentRoute.value.params.recipeId).toBe(await idOf('Poke bowl'))
  })

  it('explique comment créer une recette quand il n’y en a pas', async () => {
    recipes = new InMemoryRecipeRepository()
    const wrapper = await mountAt(RecipeListView, '/garde-manger/recettes')

    expect(wrapper.text()).toContain('Vous n’avez pas encore de recette.')
    expect(wrapper.text()).toContain('Garder comme recette')
  })
})

describe('RecipeDetailView', () => {
  const open = async (name: string) =>
    mountAt(RecipeDetailView, `/garde-manger/recettes/${await idOf(name)}`)

  it('montre les aliments avec leur quantité dans leur mesure', async () => {
    const wrapper = await open('Toast')

    const inputs = wrapper.findAll('.recipe__amount input').map((i) => (i.element as HTMLInputElement).value)
    expect(inputs).toEqual(['2', '10'])
  })

  it('renomme la recette, et refuse un nom déjà pris', async () => {
    const wrapper = await open('Toast')
    const input = wrapper.find('.recipe__field input')

    await input.setValue('Tartine')
    await wrapper.find('.recipe__rename').trigger('submit')
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Tartine')
    expect(wrapper.find('.recipe__feedback').text()).toBe('Nom enregistré.')

    await input.setValue('poke bowl')
    await wrapper.find('.recipe__rename').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('porte ce nom')
    expect(wrapper.find('h1').text()).toBe('Tartine')
  })

  it('n’offre pas de renommer sans changement', async () => {
    const wrapper = await open('Toast')

    expect(button(wrapper, 'Changer le nom').attributes('aria-disabled')).toBe('true')
  })

  it('corrige une quantité sur `change`, en convertissant la mesure en grammes', async () => {
    const wrapper = await open('Toast')
    const input = wrapper.findAll('.recipe__amount input')[0]!

    ;(input.element as HTMLInputElement).value = '3'
    await input.trigger('change')
    await flushPromises()

    expect((await savedToast()).lines[0]!.quantity.grams).toBe(75)
    expect(wrapper.find('.recipe__feedback').text()).toContain('Pain de mie')
  })

  it.each(['', '0', '-2', 'abc'])('ignore une quantité inexploitable (%p)', async (value) => {
    const wrapper = await open('Toast')
    const input = wrapper.findAll('.recipe__amount input')[0]!

    ;(input.element as HTMLInputElement).value = value
    await input.trigger('change')
    await flushPromises()

    expect((await savedToast()).lines[0]!.quantity.grams).toBe(50)
  })

  it('retire un ingrédient, et bloque le dernier', async () => {
    const wrapper = await open('Toast')

    await button(wrapper, '×').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.recipe__line')).toHaveLength(1)
    expect(wrapper.find('.recipe__feedback').text()).toBe('Pain de mie retiré de la recette.')
    expect(button(wrapper, '×').attributes('aria-disabled')).toBe('true')
  })

  it('supprime la recette après confirmation, puis revient à la liste', async () => {
    const wrapper = await open('Toast')

    await button(wrapper, 'Supprimer la recette').trigger('click')
    expect(await savedToast()).toBeDefined()

    await button(wrapper, 'Supprimer').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(ROUTE.recipes)
    const left = await recipes.findByPlayer(me)
    expect(left.ok && left.value.map((r) => r.name)).toEqual(['Poke bowl'])
  })

  it('dit qu’une recette a disparu', async () => {
    const wrapper = await mountAt(RecipeDetailView, '/garde-manger/recettes/inconnue')

    expect(wrapper.text()).toContain('Cette recette n’existe plus.')
  })
})
