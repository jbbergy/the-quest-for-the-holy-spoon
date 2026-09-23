// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import MealEditorView from '@/app/views/MealEditorView.vue'
import { addDays, dayKeyOf } from '@/core/day'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { ok } from '@/core/result'
import { MealType } from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex, BodyMeasurements } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

const playerId: PlayerId = idFrom('player-1')
const today = dayKeyOf(new Date())
const tomorrow = addDays(today, 1)

const player = Player.reconstitute({
  id: playerId,
  name: 'Perceval',
  measurements: BodyMeasurements.reconstitute({
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
  }),
  activityLevel: ActivityLevel.MODERATE,
  preferences: DietaryPreferences.reconstitute({ restrictions: [], allergens: [] }),
})

const chicken = FoodItem.reconstitute({
  id: idFrom('ciqual:36007'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
  source: FoodSource.CIQUAL,
})

const mealOf = (overrides: Record<string, unknown> = {}) => ({
  mealId: idFrom('meal-1'),
  playerId,
  type: MealType.LUNCH,
  loggedAt: '2026-04-10T12:30:00.000Z',
  plannedFor: today,
  consumedAt: null,
  entryCount: 1,
  macros: { proteinG: 20, carbsG: 0, fatG: 10 },
  detail: { fiberG: 0, sugarsG: 0, saturatedFatG: 3, saltG: 0.2 },
  calories: 170,
  entries: [
    {
      entryId: idFrom('entry-1'),
      foodItemId: chicken.id,
      foodName: 'Blanc de poulet',
      grams: 100,
      calories: 170,
    },
  ],
  ...overrides,
})

let changeQuantity: ReturnType<typeof vi.fn>
let removeEntry: ReturnType<typeof vi.fn>
let addFood: ReturnType<typeof vi.fn>
let router: Router

async function mountAt(path: string, meal = mealOf()): Promise<VueWrapper> {
  changeQuantity = vi.fn(async () => ok(null))
  removeEntry = vi.fn(async () => ok(null))
  addFood = vi.fn(async () => ok({ id: meal.mealId }))

  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player) } as never,
      inventory: {
        getMeal: succeedsWith(meal),
        changeQuantity: { execute: changeQuantity },
        removeEntry: { execute: removeEntry },
        addFood: { execute: addFood },
        find: succeedsWith({ kind: 'by_name', items: [chicken], onlineSearched: true }),
      } as never,
    }),
  )

  // La garde du routeur charge normalement le profil ; ici on le fait à la main.
  await usePlayerStore().load()

  const blank = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/semaine', name: ROUTE.weekPlan, component: blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: MealEditorView },
      { path: '/aliments/nouveau', name: ROUTE.customFood, component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(MealEditorView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
  vi.restoreAllMocks()
})

describe('MealEditorView — repas existant', () => {
  it('expose la portion de chaque ligne en saisie', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    const input = wrapper.find('.editor__grams input')
    expect((input.element as HTMLInputElement).value).toBe('100')
  })

  it('corrige la portion sur `change`, pas à chaque frappe', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')
    const input = wrapper.find('.editor__grams input')

    // `setValue` de test-utils émet `input` **et** `change` : on pilote donc
    // l'élément directement pour distinguer les deux moments.
    ;(input.element as HTMLInputElement).value = '250'
    await input.trigger('input')
    expect(changeQuantity).not.toHaveBeenCalled()

    await input.trigger('change')
    expect(changeQuantity).toHaveBeenCalledWith(idFrom('meal-1'), idFrom('entry-1'), 250)
  })

  it.each(['', '0', '-5', 'abc'])('ignore une saisie inexploitable (%p)', async (value) => {
    const wrapper = await mountAt('/semaine/repas/meal-1')
    const input = wrapper.find('.editor__grams input')

    ;(input.element as HTMLInputElement).value = value
    await input.trigger('change')

    // L'usager est en train de retaper son nombre : refuser bruyamment serait
    // pire que ne rien faire.
    expect(changeQuantity).not.toHaveBeenCalled()
  })

  it('permet de retirer une ligne, sous un nom accessible distinct', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    const remove = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Retirer Blanc de poulet'))

    await remove!.trigger('click')
    expect(removeEntry).toHaveBeenCalledWith(idFrom('meal-1'), idFrom('entry-1'))
  })

  it('propose « Pris » pour un repas du jour', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    expect(wrapper.find('[aria-pressed]').exists()).toBe(true)
  })

  it('ne propose pas « Pris » pour un repas à venir', async () => {
    // Le domaine le refuserait : un bouton voué à l'échec n'a rien à faire là.
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf({ plannedFor: tomorrow }))

    expect(wrapper.find('[aria-pressed]').exists()).toBe(false)
  })
})

describe('MealEditorView — repas pris', () => {
  const eaten = () => mealOf({ consumedAt: `${today}T12:45:00.000Z` })

  it('retire toute commande de modification', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', eaten())

    expect(wrapper.find('.editor__grams input').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text().includes('Retirer'))).toBe(
      false,
    )
    expect(wrapper.text()).not.toContain('Ajouter un aliment')
    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).disabled).toBe(true)
  })

  it('affiche la portion et dit comment la corriger', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', eaten())

    // Masquer les commandes sans expliquer laisserait croire à un bug.
    expect(wrapper.text()).toContain('100 g')
    expect(wrapper.text()).toContain('décochez « Pris » pour le modifier')
  })
})

describe('MealEditorView — nouveau repas', () => {
  it('reprend le jour et le type demandés, sans rien écrire', async () => {
    const wrapper = await mountAt(`/semaine/repas?jour=${tomorrow}&type=DINNER`)

    expect(wrapper.find('h1').text()).toBe('Nouveau repas')
    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe(tomorrow)
    expect(
      (wrapper.find('input[name="mealType"][value="DINNER"]').element as HTMLInputElement).checked,
    ).toBe(true)
    expect(wrapper.text()).not.toContain('Dans ce repas')
    expect(addFood).not.toHaveBeenCalled()
  })

  it('crée le repas au premier aliment et prend son adresse', async () => {
    const wrapper = await mountAt(`/semaine/repas?jour=${tomorrow}&type=DINNER`)

    await wrapper.find('input[type="search"], .editor__search input').setValue('poulet')
    await wrapper.find('form.editor__search').trigger('submit')
    await flushPromises()
    await wrapper.find(`input[name="food"][value="${chicken.id}"]`).setValue(true)
    const add = wrapper.findAll('button').find((button) => button.text().startsWith('Ajouter Blanc'))
    await add!.trigger('click')
    await flushPromises()

    expect(addFood).toHaveBeenCalledWith(
      expect.objectContaining({ plannedFor: tomorrow, mealType: MealType.DINNER, grams: 100 }),
    )
    // Un rechargement doit retrouver le repas, pas un brouillon vide.
    expect(router.currentRoute.value.params.mealId).toBe('meal-1')
  })

  it('ignore un jour illisible dans l’adresse', async () => {
    const wrapper = await mountAt('/semaine/repas?jour=2026-02-30&type=LUNCH')

    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe(today)
  })
})
