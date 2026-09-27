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
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import { householdKey } from '@/app/useHousehold'
import HouseholdView from '@/app/views/HouseholdView.vue'
import MemberDayView from '@/app/views/MemberDayView.vue'
import WeekPlanView from '@/app/views/WeekPlanView.vue'
import { dayKeyOf } from '@/core/day'
import { idFrom } from '@/core/identity'
import { ok } from '@/core/result'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import type { HouseholdView as Household } from '@/modules/household/application'
import { MealType } from '@/modules/nutrition_inventory/application'
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
      { path: '/foyer', name: ROUTE.household, component: path === '/foyer' ? view : blank },
      { path: '/foyer/membres/:playerId', name: ROUTE.memberDay, component: path.startsWith('/foyer/membres') ? view : blank },
      { path: '/semaine', name: ROUTE.weekPlan, component: path === '/semaine' ? view : blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: blank },
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
    expect(wrapper.text()).toContain('Riz au poulet')
    expect(wrapper.findAll('.member__meal-state').map((state) => state.text())).toEqual(['Mangé', 'Prévu'])
    // Ni case « Mangé », ni lien d'édition.
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['← Foyer'])
  })

  it('remonte d’un jour, sans aller au-delà d’aujourd’hui', async () => {
    const read = vi.fn(async () => ok(alexDay))
    const wrapper = await mountAt(MemberDayView, '/foyer/membres/player-alex', { memberDays: { read } })

    const next = wrapper.findAll('button').find((button) => button.text().includes('Jour suivant'))
    expect(next?.attributes('disabled')).toBeDefined()

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

    const links = wrapper.findAll('a').filter((link) => link.text().startsWith('Voir ses journées'))
    expect(links.map((link) => link.attributes('href'))).toEqual(['/foyer/membres/player-alex'])
    // Le nom du profil en titre, l'adresse en appoint.
    expect(wrapper.text()).toContain('Alex')
    expect(wrapper.text()).toContain('alex@example.fr')
  })
})

describe('Prévoir aussi pour…', () => {
  const mealId = { mealId: idFrom('meal-1') }

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
        { playerId: alex, name: 'Alex', targetCalories: 2500 },
        { playerId: 'player-sacha', name: 'sacha@example.fr', targetCalories: null },
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
