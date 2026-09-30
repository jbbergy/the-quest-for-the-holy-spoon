// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  createFakeContainer,
  failsWith,
  type FakeContainerOverrides,
  fakeSyncEngine,
  succeedsWith,
} from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import ShoppingListView from '@/app/views/ShoppingListView.vue'
import WeekPlanView from '@/app/views/WeekPlanView.vue'
import { type DayKey, startOfWeek } from '@/core/day'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { ok } from '@/core/result'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import type { HouseholdView as Household } from '@/modules/household/application'
import { MealType } from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import {
  AddFoodToShoppingListUseCase,
  AddShoppingItemUseCase,
  CheckShoppingItemUseCase,
  FillShoppingListUseCase,
  GetShoppingListUseCase,
  RemoveShoppingItemsUseCase,
} from '@/modules/shopping/application'
import { InMemoryShoppingRepository } from '@/modules/shopping/infrastructure/InMemoryShoppingRepository'

import { playerOf } from '../../sync/__tests__/fixtures'

const me = idFrom<'PlayerId'>('player-1')
const alex = idFrom<'PlayerId'>('player-alex')
const WEEK = '2026-09-28' as DayKey
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
    member({ accountId: session.accountId, playerId: me, name: 'Camille', isOwner: true }),
    member({ accountId: idFrom('account-alex'), playerId: alex, name: 'Alex' }),
    member({ accountId: idFrom('account-sacha'), playerId: idFrom('player-sacha'), email: 'sacha@example.fr', sharesDays: false }),
    member({ accountId: idFrom('account-noa'), email: 'noa@example.fr' }),
  ],
}

const EGG = { label: 'œuf', grams: 60, countable: true, approximate: true }
const GRAM = { label: 'g', grams: 1, countable: false, approximate: false }

const entry = (foodItemId: string, foodName: string, grams: number, measure = GRAM) => ({
  entryId: idFrom(`e-${foodItemId}`),
  foodItemId: idFrom(foodItemId),
  foodName,
  grams,
  measure,
  amount: grams / measure.grams,
  calories: 100,
})

const meal = (playerId: PlayerId, consumed: boolean, entries: ReturnType<typeof entry>[]) => ({
  mealId: idFrom(`meal-${playerId}-${String(consumed)}`),
  playerId,
  type: MealType.DINNER,
  loggedAt: `${WEEK}T08:00:00.000Z`,
  plannedFor: WEEK,
  consumedAt: consumed ? `${WEEK}T20:00:00.000Z` : null,
  plannedBy: null,
  entryCount: entries.length,
  macros: { proteinG: 1, carbsG: 1, fatG: 1 },
  detail: { fiberG: 0, sugarsG: 0, saturatedFatG: 0, saltG: 0 },
  calories: 100,
  entries,
})

/** Ma semaine : des œufs et du riz à acheter, et un repas déjà mangé qui ne compte plus. */
const myWeek = {
  days: [
    {
      day: WEEK,
      plannedCalories: 200,
      meals: [
        meal(me, false, [entry('oeuf', 'Œuf', 120, EGG), entry('riz', 'Riz', 80)]),
        meal(me, true, [entry('chocolat', 'Chocolat', 40)]),
      ],
    },
  ],
}

/** Vrais use cases sur un stockage en mémoire : l'écran, le store et le remplissage ensemble. */
function realShopping() {
  const items = new InMemoryShoppingRepository()
  return {
    get: new GetShoppingListUseCase(items),
    fill: new FillShoppingListUseCase(items),
    add: new AddShoppingItemUseCase(items),
    check: new CheckShoppingItemUseCase(items),
    remove: new RemoveShoppingItemsUseCase(items),
    addFood: new AddFoodToShoppingListUseCase(items),
  }
}

const blank = { template: '<div />' }
let router: Router

async function mountAt(
  view: Component,
  path: string,
  overrides: FakeContainerOverrides = {},
  signedIn = true,
) {
  provideContainer(
    createFakeContainer({
      shopping: realShopping(),
      ...overrides,
      household: { get: succeedsWith(household), ...overrides.household },
      inventory: { week: succeedsWith(myWeek), ...overrides.inventory },
    }),
  )
  if (signedIn) useAccountStore().session = session
  usePlayerStore().player = playerOf('player-1')
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/semaine', name: ROUTE.weekPlan, component: path === '/semaine' ? view : blank },
      { path: '/semaine/courses', name: ROUTE.shoppingList, component: path.startsWith('/semaine/courses') ? view : blank },
      { path: '/semaine/repas/:mealId?', name: ROUTE.mealEditor, component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const alexMeals = vi.fn(async () => ok([meal(alex, false, [entry('riz', 'Riz', 100), entry('lait', 'Lait', 250)])]))

const rows = (wrapper: Awaited<ReturnType<typeof mountAt>>) =>
  wrapper
    .findAll('.shopping__item')
    .map((row) => row.find('.shopping__check').text().replace(/\s+/g, ' ').replace(' ,', ',').trim())

const button = (wrapper: Awaited<ReturnType<typeof mountAt>>, label: string) => {
  const found = wrapper.findAll('button').find((candidate) => candidate.text().includes(label))
  if (found === undefined) throw new Error(`Bouton introuvable : ${label}`)
  return found
}

async function searchFor(wrapper: Awaited<ReturnType<typeof mountAt>>, text: string): Promise<void> {
  await wrapper.find('.picker__search input').setValue(text)
  await wrapper.find('form.picker__search').trigger('submit')
  await flushPromises()
}

const rice = FoodItem.reconstitute({
  id: idFrom('riz'),
  name: 'Riz',
  macrosPer100g: Macros.reconstitute({ proteinG: 7, carbsG: 78, fatG: 1 }),
  source: FoodSource.CIQUAL,
})

const eggFood = FoodItem.reconstitute({
  id: idFrom('oeuf'),
  name: 'Œuf',
  macrosPer100g: Macros.reconstitute({ proteinG: 13, carbsG: 1, fatG: 10 }),
  source: FoodSource.CIQUAL,
  servings: [{ label: 'œuf', grams: 60, approximate: true }],
})

const findsFoods = { find: succeedsWith({ kind: 'by_name', items: [rice, eggFood], excluded: [], onlineSearched: true }) }

beforeEach(() => {
  setActivePinia(createPinia())
  alexMeals.mockClear()
})

afterEach(() => {
  resetContainer()
  document.body.innerHTML = ''
})

describe('Accès depuis la semaine', () => {
  it('ouvre la liste de la semaine affichée', async () => {
    const wrapper = await mountAt(WeekPlanView, '/semaine')

    await button(wrapper, 'Ouvrir la liste').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(ROUTE.shoppingList)
    expect(router.currentRoute.value.query.semaine).toBe(startOfWeek(router.currentRoute.value.query.semaine as DayKey))
    expect(router.currentRoute.value.query.retour).toBe('/semaine')
  })

  it('demande à la liste de se remplir en l’ouvrant', async () => {
    const wrapper = await mountAt(WeekPlanView, '/semaine')

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(ROUTE.shoppingList)
    expect(router.currentRoute.value.query.remplir).toBe('1')
  })
})

describe('Liste de courses du foyer', () => {
  it('dit qu’elle est commune, et commence vide', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`)

    expect(wrapper.text()).toContain('Semaine du 28 septembre – 4 octobre')
    expect(wrapper.text()).toContain('commune au foyer « Les Martin »')
    expect(wrapper.text()).toContain('La liste est vide.')
  })

  it('se remplit avec les repas pas encore mangés, les siens et ceux des membres qui partagent leurs journées', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      memberDays: { meals: alexMeals },
    })

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(alexMeals).toHaveBeenCalledWith(alex, WEEK, '2026-10-04')
    expect(rows(wrapper)).toEqual(['Lait, 250 g', 'Œuf, 2 œufs', 'Riz, 180 g'])
    expect(wrapper.text()).toContain('La liste est à jour : 3 articles ajoutés.')
    expect(wrapper.text()).toContain(
      'Les repas de sacha@example.fr ne sont pas comptés : sacha@example.fr ne partage pas ses journées.',
    )

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('La liste était déjà à jour.')
  })

  it('se remplit dès l’ouverture quand on vient de « Remplir la liste », une seule fois', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}&remplir=1`, {
      memberDays: { meals: alexMeals },
    })
    await flushPromises()

    expect(rows(wrapper)).toEqual(['Lait, 250 g', 'Œuf, 2 œufs', 'Riz, 180 g'])
    expect(wrapper.text()).toContain('La liste est à jour : 3 articles ajoutés.')
    // Retiré de l'adresse : un rechargement ne remplirait pas de nouveau.
    expect(router.currentRoute.value.query).toEqual({ semaine: WEEK })
  })

  it('garde les parts d’un membre qu’on ne peut pas lire, et le dit', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      memberDays: {
        meals: vi.fn(async () => ({ ok: false, error: { kind: 'remote', code: 'SERVER_UNREACHABLE', message: 'x' } })),
      },
    })

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Les repas de Alex ne sont pas comptés : pas de connexion.')
    expect(rows(wrapper)).toEqual(['Œuf, 2 œufs', 'Riz, 80 g'])
  })

  it('traite un refus du serveur comme des journées non partagées', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      memberDays: {
        meals: vi.fn(async () => ({ ok: false, error: { kind: 'remote', code: 'DAYS_NOT_SHARED', message: 'x' } })),
      },
    })

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Alex ne partage pas ses journées')
  })

  it('coche, ajoute et retire des articles', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`)
    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    await searchFor(wrapper, 'lessive')
    await button(wrapper, 'Ajouter « lessive » tel quel').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['lessive', 'Œuf, 2 œufs', 'Riz, 80 g'])
    expect(wrapper.text()).toContain('lessive ajouté.')

    // Cocher garde l'article à sa place, barré.
    await wrapper.findAll('.shopping__item input[type="checkbox"]')[1]!.setValue(true)
    await flushPromises()
    expect(rows(wrapper)).toEqual(['lessive', 'Œuf, 2 œufs', 'Riz, 80 g'])
    expect(wrapper.findAll('.shopping__item--done').map((row) => row.text())).toEqual([
      expect.stringContaining('Œuf'),
    ])
    expect(wrapper.text()).toContain('3 articles, dont 1 dans le panier')
    const boxes = () => wrapper.findAll<HTMLInputElement>('.shopping__item input[type="checkbox"]')
    expect(boxes().map((box) => box.element.checked)).toEqual([false, true, false])

    // Décocher le remet à acheter.
    await boxes()[1]!.setValue(false)
    await flushPromises()
    expect(boxes().map((box) => box.element.checked)).toEqual([false, false, false])
    expect(wrapper.find('.shopping__item--done').exists()).toBe(false)

    // Seule la croix retire un article, coché ou non.
    await boxes()[0]!.setValue(true)
    await flushPromises()
    await button(wrapper, 'Retirer lessive').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['Œuf, 2 œufs', 'Riz, 80 g'])
  })

  it('ne retire rien quand un repas disparaît : l’article reste, « plus dans les repas »', async () => {
    let week: unknown = myWeek
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: { execute: async () => ok(week) } },
    })
    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    // Le repas aux œufs et au riz est supprimé de la semaine.
    week = { days: [{ day: WEEK, plannedCalories: 0, meals: [] }] }
    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(rows(wrapper)).toEqual(['Œuf, plus dans les repas', 'Riz, plus dans les repas'])
    expect(wrapper.text()).toContain('La liste est à jour : 2 articles changés.')
  })

  it('garde la case cochée d’un rechargement à l’autre', async () => {
    const shopping = realShopping()
    const first = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, { shopping })
    await button(first, 'Remplir la liste').trigger('click')
    await flushPromises()
    await first.findAll('.shopping__item input[type="checkbox"]')[0]!.setValue(true)
    await flushPromises()
    first.unmount()

    setActivePinia(createPinia())
    const again = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, { shopping })

    expect(again.findAll<HTMLInputElement>('.shopping__item input[type="checkbox"]').map((box) => box.element.checked)).toEqual([true, false])
  })

  it('ajoute un aliment par la même recherche que les repas, avec sa portion', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: succeedsWith(myWeek), ...findsFoods },
    })
    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    await searchFor(wrapper, 'oeuf')
    await wrapper.find(`input[name="food"][value="${eggFood.id}"]`).setValue(true)
    // La portion proposée d'emblée : un œuf.
    expect(wrapper.find('.portion__unit').text()).toBe('œuf')
    await button(wrapper, 'Ajouter Œuf').trigger('click')
    await flushPromises()

    // Il rejoint la ligne des repas : 2 œufs + 1.
    expect(rows(wrapper)).toEqual(['Œuf, 3 œufs', 'Riz, 80 g'])
    expect(wrapper.text()).toContain('Œuf ajouté (1 œuf).')
    expect(wrapper.find('input[name="food"]:checked').exists()).toBe(false)

    await wrapper.find(`input[name="food"][value="${rice.id}"]`).setValue(true)
    await button(wrapper, 'Ajouter Riz').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['Œuf, 3 œufs', 'Riz, 180 g'])
  })

  it('propose l’ajout tel quel après toute recherche, même quand elle trouve quelque chose', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: succeedsWith(myWeek), ...findsFoods },
    })
    const offered = () => wrapper.findAll('button').some((candidate) => candidate.text().includes('tel quel'))

    expect(offered()).toBe(false)
    await searchFor(wrapper, '  ')
    expect(offered()).toBe(false)

    await searchFor(wrapper, 'riz complet')
    expect(wrapper.find(`input[name="food"][value="${rice.id}"]`).exists()).toBe(true)
    await button(wrapper, 'Ajouter « riz complet » tel quel').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['riz complet'])
  })

  it('n’affiche qu’une quantité à la fois : la portion d’un aliment choisi, ou la quantité libre', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: succeedsWith(myWeek), ...findsFoods },
    })
    await searchFor(wrapper, 'oeuf')
    expect(wrapper.find('.shopping__as-is input').exists()).toBe(true)

    await wrapper.find(`input[name="food"][value="${eggFood.id}"]`).setValue(true)
    expect(wrapper.find('.shopping__as-is').exists()).toBe(false)
    expect(wrapper.find('.portion__field input').exists()).toBe(true)

    // La portion saisie est celle qui compte.
    await wrapper.find('.portion__field input').setValue('4')
    await button(wrapper, 'Ajouter Œuf').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['Œuf, 4 œufs'])

    await wrapper.find(`input[name="food"][value="${eggFood.id}"]`).setValue(true)
    await button(wrapper, 'Aucun de ces aliments').trigger('click')
    expect(wrapper.find('.portion__field').exists()).toBe(false)
    expect(wrapper.find('.shopping__as-is input').exists()).toBe(true)
  })

  it('ajoute tel quel avec une quantité libre, puis vide la recherche', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: succeedsWith(myWeek), ...findsFoods },
    })
    await searchFor(wrapper, 'lessive')

    await wrapper.find('.shopping__as-is input').setValue(' 1   bidon ')
    await button(wrapper, 'Ajouter « lessive » tel quel').trigger('click')
    await flushPromises()

    expect(rows(wrapper)).toEqual(['lessive, 1 bidon'])
    expect(wrapper.text()).toContain('lessive ajouté (1 bidon).')
    // Le bouton disparaît avec la recherche : un second appui n'ajoute rien.
    expect((wrapper.find('.picker__search input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('input[name="food"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((candidate) => candidate.text().includes('tel quel'))).toBe(false)

    // La quantité est facultative, et repart vide.
    await searchFor(wrapper, 'piles')
    expect((wrapper.find('.shopping__as-is input').element as HTMLInputElement).value).toBe('')
    await button(wrapper, 'Ajouter « piles » tel quel').trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toEqual(['lessive, 1 bidon', 'piles'])
  })

  it('refuse une quantité trop longue, et garde la recherche pour corriger', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`)
    await searchFor(wrapper, 'lessive')

    await wrapper.find('.shopping__as-is input').setValue('x'.repeat(31))
    await button(wrapper, 'tel quel').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(rows(wrapper)).toEqual([])
    expect((wrapper.find('.shopping__as-is input').element as HTMLInputElement).value).toBe('x'.repeat(31))
  })

  it('présélectionne l’aliment qu’on vient de créer', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}&aliment=riz`, {
      inventory: { week: succeedsWith(myWeek), ...findsFoods },
    })
    await searchFor(wrapper, 'riz')

    expect((wrapper.find(`input[name="food"][value="${rice.id}"]`).element as HTMLInputElement).checked).toBe(true)
  })

  it('refuse un article au nom trop long', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`)

    await searchFor(wrapper, 'x'.repeat(81))
    await button(wrapper, 'tel quel').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('80 lettres au plus')
  })

  it('hors ligne, reste la liste du foyer, et ne compte que ses repas', async () => {
    const sync = fakeSyncEngine()
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      sync: { ...sync, knownHouseholdId: async () => 'household-1' } as unknown as typeof sync,
      household: {
        get: failsWith({ kind: 'remote', code: 'SERVER_UNREACHABLE', message: 'x' }),
        receivedInvitations: failsWith({ kind: 'remote', code: 'SERVER_UNREACHABLE', message: 'x' }),
      },
      memberDays: { meals: alexMeals },
    })

    expect(wrapper.text()).toContain('Cette liste est commune au foyer. Chaque membre la voit')
    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(alexMeals).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Pas de connexion : seuls vos repas sont comptés.')
  })

  it('dit quand la semaine n’a pas pu être lue', async () => {
    const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
      inventory: { week: failsWith({ kind: 'application', code: 'WEEK_UNREADABLE', message: 'x' }) },
    })

    await button(wrapper, 'Remplir la liste').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(rows(wrapper)).toEqual([])
  })

  it('relit souvent pendant qu’elle est ouverte', async () => {
    vi.useFakeTimers()
    try {
      const sync = fakeSyncEngine()
      const run = vi.fn(async () => undefined)
      const wrapper = await mountAt(ShoppingListView, `/semaine/courses?semaine=${WEEK}`, {
        sync: { ...sync, sync: run } as unknown as typeof sync,
      })

      vi.advanceTimersByTime(20_000)
      expect(run).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      vi.advanceTimersByTime(60_000)
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Liste de courses sans compte', () => {
  it('est personnelle', async () => {
    const wrapper = await mountAt(ShoppingListView, '/semaine/courses', {}, false)

    expect(wrapper.text()).toContain('Cette liste est à vous seulement.')
  })
})
