// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  createFakeContainer,
  type FakeContainerOverrides,
  fakeSyncEngine,
  succeedsWith,
} from '@/app/__tests__/fakeContainer'
import PlanForMembersCard from '@/app/components/PlanForMembersCard.vue'
import { usePlanForMembersStore } from '@/app/plan/usePlanForMembersStore'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import { householdKey } from '@/app/useHousehold'
import HouseholdView from '@/app/views/HouseholdView.vue'
import MealReplaceView from '@/app/views/MealReplaceView.vue'
import MemberDayView from '@/app/views/MemberDayView.vue'
import WeekPlanView from '@/app/views/WeekPlanView.vue'
import { addDays, dayKeyOf, startOfWeek } from '@/core/day'
import { idFrom } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { ok } from '@/core/result'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import type { HouseholdView as Household } from '@/modules/household/application'
import { MealType } from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { GRAM } from '@/modules/nutrition_inventory/domain/Measure'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'

import { playerOf } from '../../sync/__tests__/fixtures'

const me = idFrom<'PlayerId'>('player-1')
const alex = idFrom<'PlayerId'>('player-alex')
const today = dayKeyOf(new Date())

const session = { accountId: idFrom<'AccountId'>('account-1'), email: 'camille@example.fr', playerId: me }

const member = (overrides: Partial<Household['members'][number]>): Household['members'][number] => ({
  accountId: idFrom('account-x'),
  playerId: null,
  name: null,
  targetCalories: null,
  email: 'x@example.fr',
  isOwner: false,
  joinedAt: new Date('2026-09-20T10:00:00Z'),
  sharesDays: true,
  ...overrides,
})

const household: Household = {
  id: idFrom('household-1'),
  name: 'Les Martin',
  role: 'owner',
  sharesDays: true,
  invitations: [],
  members: [
    member({ accountId: session.accountId, playerId: me, name: 'Camille', targetCalories: 2000, isOwner: true, email: 'camille@example.fr' }),
    member({ accountId: idFrom('account-alex'), playerId: alex, name: 'Alex', targetCalories: 2500, email: 'alex@example.fr' }),
    member({ accountId: idFrom('account-sacha'), playerId: idFrom('player-sacha'), name: null, email: 'sacha@example.fr', sharesDays: false }),
    member({ accountId: idFrom('account-noa'), email: 'noa@example.fr' }),
  ],
}

const summary = (consumed: boolean, plannedBy: string | null = null) => ({
  mealId: idFrom(`meal-${consumed ? 'pris' : 'prevu'}`),
  playerId: alex,
  type: consumed ? MealType.LUNCH : MealType.DINNER,
  loggedAt: `${today}T08:00:00.000Z`,
  plannedFor: today,
  consumedAt: consumed ? `${today}T12:30:00.000Z` : null,
  plannedBy: plannedBy === null ? null : idFrom(plannedBy),
  entryCount: 1,
  macros: { proteinG: 20, carbsG: 50, fatG: 10 },
  detail: { fiberG: 3, sugarsG: 5, saturatedFatG: 2, saltG: 1 },
  calories: 370,
  entries: [{ entryId: idFrom('e'), foodItemId: idFrom('f'), foodName: 'Riz au poulet', grams: 200, calories: 370 }],
})

const blank = { template: '<div />' }
let router: Router

async function mountAt(
  view: Component,
  path: string,
  overrides: FakeContainerOverrides = {},
  props: Record<string, unknown> = {},
) {
  provideContainer(
    createFakeContainer({ ...overrides, household: { get: succeedsWith(household), ...overrides.household } }),
  )
  useAccountStore().session = session
  usePlayerStore().player = playerOf('player-1')
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tableau-de-bord', name: ROUTE.dashboard, component: blank },
      { path: '/foyer', name: ROUTE.household, component: path === '/foyer' ? view : blank },
      { path: '/foyer/membres/:playerId', name: ROUTE.memberDay, component: path.startsWith('/foyer/membres') ? view : blank },
      { path: '/semaine', name: ROUTE.weekPlan, component: path === '/semaine' ? view : blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: blank },
      { path: '/semaine/repas/:mealId/remplacer/:playerId', name: ROUTE.mealReplace, component: blank },
      { path: '/reglages', name: ROUTE.settings, component: blank },
      { path: '/connexion', name: ROUTE.signIn, component: blank },
      { path: '/inscription', name: ROUTE.signUp, component: blank },
      { path: '/foyer/invitations/:invitationId', name: ROUTE.invitation, component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { props, global: { plugins: [router] }, attachTo: document.body })
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

describe('Journée d’un membre', () => {
  const alexDay = {
    day: today,
    name: 'Alex',
    needs: {
      playerId: alex,
      targetCalories: 2500,
      targetMacros: { proteinG: 100, carbsG: 300, fatG: 90 },
      referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 30, saltG: 5 },
      restrictions: [],
      allergens: [],
    },
    journal: {
      day: today,
      meals: [summary(true), summary(false)],
      consumedMeals: [summary(true)],
      totalCalories: 370,
      totalMacros: { proteinG: 20, carbsG: 50, fatG: 10 },
      totalDetail: { fiberG: 3, sugarsG: 5, saturatedFatG: 2, saltG: 1 },
    },
    recent: null,
  }

  it('montre ses jauges et ses repas, sans rien de modifiable', async () => {
    const read = vi.fn(async () => ok(alexDay))
    const wrapper = await mountAt(MemberDayView, '/foyer/membres/player-alex', { memberDays: { read } })

    expect(read).toHaveBeenCalledWith('player-alex', today)
    expect(wrapper.find('h1').text()).toBe('Alex')
    expect(wrapper.text()).toContain('Repas d’Alex')
    expect(wrapper.text()).toContain('sur 2500 kcal')
    // On parle d'Alex, pas à Alex.
    expect(wrapper.text()).toContain('Il lui reste')
    expect(wrapper.text()).not.toContain('Il vous reste')
    expect(wrapper.text()).toContain('Riz au poulet')
    expect(wrapper.findAll('.member__meal-state').map((state) => state.text())).toEqual(['Mangé', 'Prévu'])
    // Ni case « Mangé », ni lien d'édition.
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Foyer'])
  })

  it('remonte d’un jour, sans aller au-delà d’aujourd’hui', async () => {
    const read = vi.fn(async () => ok(alexDay))
    const wrapper = await mountAt(MemberDayView, '/foyer/membres/player-alex', { memberDays: { read } })

    const next = wrapper.findAll('button').find((button) => button.text().includes('Jour suivant'))
    expect(next?.attributes('aria-disabled')).toBe('true')
    await next!.trigger('click')
    expect(read).toHaveBeenCalledTimes(1)

    const previous = wrapper.findAll('button').find((button) => button.text().includes('Jour précédent'))
    await previous!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.jour).not.toBe(today)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('dit simplement qu’un membre ne partage pas ses journées', async () => {
    const read = vi.fn(async () => ({
      ok: false as const,
      error: { kind: 'remote', code: 'DAYS_NOT_SHARED', message: '' },
    }))
    const wrapper = await mountAt(MemberDayView, '/foyer/membres/player-alex', { memberDays: { read } })
    await flushPromises()

    expect(wrapper.text()).toContain('Alex ne montre pas ses journées pour le moment.')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('montre les repas sans jauges quand les besoins manquent', async () => {
    const read = vi.fn(async () => ok({ ...alexDay, needs: null, name: null }))
    const wrapper = await mountAt(MemberDayView, '/foyer/membres/player-alex', { memberDays: { read } })

    expect(wrapper.text()).toContain('Les jauges d’Alex ne sont pas encore prêtes')
    expect(wrapper.text()).toContain('Riz au poulet')
  })
})

describe('Foyer — accès aux journées', () => {
  it('ne propose de voir que les journées partagées des autres membres', async () => {
    const wrapper = await mountAt(HouseholdView, '/foyer')

    const links = wrapper
      .findAll('.members a')
      .map((link) => link.attributes('href'))
      .filter((href) => href?.startsWith('/foyer/membres/'))
    expect(links).toEqual(['/foyer/membres/player-alex'])
    // Le nom du profil sur la ligne ; l'adresse là où l'on retire quelqu'un.
    expect(wrapper.find('.members').text()).toContain('Alex')
    expect(wrapper.find('.danger').text()).toContain('alex@example.fr')
  })
})

describe('Prévoir aussi pour…', () => {
  const mealId = { mealId: idFrom('meal-1'), entries: [] }

  it('propose les autres membres qui ont un profil', async () => {
    const wrapper = await mountAt(PlanForMembersCard, '/semaine', {}, mealId)
    await flushPromises()

    const names = wrapper.findAll('label').map((label) => label.text())
    expect(names).toEqual(['Alex', 'sacha@example.fr'])
  })

  it('envoie les copies avec les besoins de chacun', async () => {
    const execute = vi.fn(async () => ok([]))
    const wrapper = await mountAt(
      PlanForMembersCard,
      '/semaine',
      { inventory: { planForMembers: { execute } } },
      mealId,
    )

    await wrapper.find('input[value="player-alex"]').setValue(true)
    await wrapper.find('input[value="player-sacha"]').setValue(true)
    await wrapper.findAll('button').find((button) => button.text().startsWith('Prévoir'))!.trigger('click')
    await flushPromises()

    expect(execute).toHaveBeenCalledWith({
      mealId: 'meal-1',
      plannedBy: me,
      ownCalories: usePlayerStore().needs?.targetCalories,
      guests: [
        { playerId: alex, name: 'Alex', targetCalories: 2500, replacements: [] },
        { playerId: 'player-sacha', name: 'sacha@example.fr', targetCalories: null, replacements: [] },
      ],
    })
    expect(wrapper.text()).toContain('Le repas est prévu pour Alex et sacha@example.fr.')
    expect(wrapper.text()).toContain('Nous ne connaissons pas encore le besoin de sacha@example.fr')
  })

  it('n’apparaît pas sans autre membre', async () => {
    const alone = { ...household, members: [household.members[0]!] }
    const wrapper = await mountAt(
      PlanForMembersCard,
      '/semaine',
      { household: { get: succeedsWith(alone) } },
      mealId,
    )
    expect(wrapper.text()).toBe('')
  })
})

describe('Remplacer un aliment pour un membre', () => {
  const merguez = { entryId: idFrom<'MealEntryId'>('ligne-merguez'), foodItemId: idFrom<'FoodItemId'>('ciqual:merguez'), foodName: 'Merguez', grams: 150, measure: GRAM, amount: 150, calories: 450, macros: { proteinG: 20, carbsG: 0, fatG: 40 } }
  const semoule = { ...merguez, entryId: idFrom<'MealEntryId'>('ligne-semoule'), foodItemId: idFrom<'FoodItemId'>('ciqual:semoule'), foodName: 'Semoule' }
  const couscous = { ...summary(false), mealId: idFrom<'MealId'>('meal-1'), playerId: me, entries: [merguez, semoule] }
  const veggie = FoodItem.reconstitute({
    id: idFrom('user:merguez-veggie'),
    name: 'Merguez végétales',
    macrosPer100g: Macros.reconstitute({ proteinG: 18, carbsG: 6, fatG: 12 }),
    source: FoodSource.USER,
    servings: [{ label: 'merguez', grams: 50, approximate: false }],
  })
  const pieces = { label: 'merguez', grams: 50, countable: true, approximate: false }
  const forAlex = { entryId: merguez.entryId, replacedName: 'Merguez', foodItemId: veggie.id, foodName: 'Merguez végétales', grams: 100, measure: pieces }

  it('mène au choix d’un remplacement pour un membre coché, et revient à l’éditeur', async () => {
    const wrapper = await mountAt(PlanForMembersCard, '/semaine/repas/meal-1', {}, { mealId: couscous.mealId, entries: couscous.entries })

    expect(wrapper.find('.plan__replace').exists()).toBe(false)
    await wrapper.find('input[value="player-alex"]').setValue(true)

    const link = wrapper.get('.plan__replace')
    expect(link.text()).toBe('Remplacer un aliment pour Alex')
    expect(link.get('.sr-only').text()).toBe('pour Alex')
    expect(link.attributes('href')).toBe('/semaine/repas/meal-1/remplacer/player-alex?retour=/semaine/repas/meal-1')
  })

  it('montre le remplacement choisi, l’envoie avec le repas, et permet de l’annuler', async () => {
    const execute = vi.fn(async () => ok([]))
    usePlanForMembersStore().forMeal(couscous.mealId)
    usePlanForMembersStore().replace(alex, forAlex)
    const wrapper = await mountAt(
      PlanForMembersCard,
      '/semaine/repas/meal-1',
      { inventory: { planForMembers: { execute } } },
      { mealId: couscous.mealId, entries: couscous.entries },
    )

    expect((wrapper.get('input[value="player-alex"]').element as HTMLInputElement).checked).toBe(true)
    const list = wrapper.get('.plan__replacements')
    expect(list.attributes('aria-label')).toBe('Changements pour Alex')
    expect(list.text()).toContain('Merguez végétales au lieu de Merguez (2 merguez)')
    expect(list.get('button').text()).toContain('Annuler le remplacement de Merguez pour Alex')

    await wrapper.findAll('button').find((button) => button.text().startsWith('Prévoir'))!.trigger('click')
    await flushPromises()
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        guests: [
          expect.objectContaining({
            playerId: alex,
            replacements: [{ entryId: merguez.entryId, foodItemId: veggie.id, grams: 100, measure: 'merguez' }],
          }),
        ],
      }),
    )
    // Envoyé : le brouillon repart de zéro.
    expect(wrapper.find('.plan__replacements').exists()).toBe(false)
  })

  it('annule un remplacement avant l’envoi', async () => {
    usePlanForMembersStore().forMeal(couscous.mealId)
    usePlanForMembersStore().replace(alex, forAlex)
    const wrapper = await mountAt(PlanForMembersCard, '/semaine/repas/meal-1', {}, { mealId: couscous.mealId, entries: couscous.entries })

    await wrapper.get('.plan__replacements button').trigger('click')

    expect(wrapper.find('.plan__replacements').exists()).toBe(false)
  })

  it('choisit l’aliment à changer, puis son remplaçant et sa quantité', async () => {
    const wrapper = await mountAt(
      MealReplaceView,
      '/semaine/repas/meal-1/remplacer/player-alex?retour=/semaine/repas/meal-1',
      {
        inventory: {
          getMeal: succeedsWith(couscous),
          find: succeedsWith({ kind: 'by_name', items: [veggie], excluded: [], onlineSearched: true }),
        },
      },
    )

    expect(wrapper.get('h1').text()).toBe('Remplacer un aliment pour Alex')
    expect(document.title).toBe('Remplacer un aliment pour Alex · Holy Spoon')
    expect(wrapper.get('legend').text()).toBe('Quel aliment changer\u202F?')
    expect(wrapper.findAll('.replace__line-name').map((line) => line.text())).toEqual(['Merguez', 'Semoule'])
    expect(wrapper.find('#par-quoi').exists()).toBe(false)

    await wrapper.get('input[value="ligne-merguez"]').trigger('change')
    await flushPromises()
    expect(router.currentRoute.value.query.ligne).toBe('ligne-merguez')
    expect(wrapper.get('#par-quoi').text()).toBe('Par quoi remplacer Merguez\u202F?')
    expect(wrapper.text()).toContain('Cette quantité n’est pas ajustée à son besoin.')

    await wrapper.get('.picker__search input').setValue('merguez')
    await wrapper.get('form.picker__search').trigger('submit')
    await flushPromises()
    await wrapper.get(`[data-food="${veggie.id}"]`).trigger('click')
    await wrapper.findAll('.portion__step')[1]!.trigger('click')
    const choose = wrapper.findAll('button').find((button) => button.text() === 'Choisir Merguez végétales')!
    await choose.trigger('click')
    await flushPromises()

    expect(usePlanForMembersStore().replacementsOf(alex)).toEqual([
      { ...forAlex, grams: 75, measure: pieces },
    ])
    expect(router.currentRoute.value.fullPath).toBe('/semaine/repas/meal-1')
  })

  it('dit quand la personne ne fait plus partie du foyer', async () => {
    const wrapper = await mountAt(
      MealReplaceView,
      '/semaine/repas/meal-1/remplacer/player-parti',
      { inventory: { getMeal: succeedsWith(couscous) } },
    )

    expect(wrapper.text()).toContain('Cette personne ne fait plus partie du foyer.')
    expect(wrapper.find('fieldset').exists()).toBe(false)
  })
})

describe('Libellés du partage', () => {
  it('dit qui a prévu un repas dans la semaine', async () => {
    const week = { days: [{ day: today, meals: [summary(false, 'player-alex')], plannedCalories: 370 }] }
    const wrapper = await mountAt(WeekPlanView, '/semaine', { inventory: { week: succeedsWith(week) } })

    expect(wrapper.text()).toContain('Prévu pour vous par Alex')
  })

  it('nomme l’auteur d’un aliment perso d’un autre membre', () => {
    expect(mount(FoodSourceTag, { props: { source: 'USER', author: 'Alex' } }).text()).toBe('Ajouté par Alex')
    expect(mount(FoodSourceTag, { props: { source: 'USER', author: null } }).text()).toBe('Mon aliment')
    expect(mount(FoodSourceTag, { props: { source: 'CIQUAL', author: 'Alex' } }).text()).toBe('Catalogue public')
  })
})

describe('Bande des jours de la semaine', () => {
  const monday = startOfWeek(today)
  const week = {
    days: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(monday, index)
      return day === today
        ? { day, meals: [summary(true), summary(false)], plannedCalories: 740 }
        : { day, meals: [], plannedCalories: 0 }
    }),
  }
  const strip = (wrapper: Awaited<ReturnType<typeof mountAt>>) => wrapper.findAll('.week__strip button')

  it('choisit aujourd’hui, et dit l’état de chaque jour en toutes lettres', async () => {
    const wrapper = await mountAt(WeekPlanView, '/semaine', { inventory: { week: succeedsWith(week) } })
    const days = strip(wrapper)
    const index = week.days.findIndex((day) => day.day === today)

    expect(days).toHaveLength(7)
    expect(days[index]!.attributes('aria-pressed')).toBe('true')
    expect(days[index]!.text()).toContain('aujourd’hui, 1 repas mangé, 1 repas prévu')
    expect(days[(index + 1) % 7]!.text()).toContain('rien de prévu')
    expect(wrapper.find('.week__card').text()).toContain('Mangé')
  })

  it('garde le jour choisi dans l’adresse, et montre ce jour-là', async () => {
    const wrapper = await mountAt(WeekPlanView, '/semaine', { inventory: { week: succeedsWith(week) } })
    const other = week.days.findIndex((day) => day.day !== today)

    await strip(wrapper)[other]!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.jour).toBe(week.days[other]!.day)
    expect(strip(wrapper)[other]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.week__card').text()).toContain('Aucun repas ce jour-là.')
  })
})

describe('Changement de foyer', () => {
  it('résume le foyer par son identifiant et ses membres, dans un ordre stable', () => {
    const reordered = { ...household, members: [...household.members].reverse() }
    expect(householdKey(reordered)).toBe(householdKey(household))
    expect(householdKey(null)).toBeNull()
    expect(householdKey({ ...household, members: household.members.slice(0, 2) })).not.toBe(
      householdKey(household),
    )
  })

  it('relance la lecture des aliments partagés une fois le foyer connu', async () => {
    const sync = fakeSyncEngine()
    const rebase = vi.fn(async () => undefined)
    Object.assign(sync, { rebase })

    // L'écran du foyer passe par `useHousehold`, comme tous ceux qui le lisent.
    await mountAt(HouseholdView, '/foyer', { sync })

    expect(rebase).toHaveBeenCalledWith(householdKey(household))
  })
})
