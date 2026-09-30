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
import { GRAM, type Measure } from '@/modules/nutrition_inventory/domain/Measure'
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

const bread = FoodItem.reconstitute({
  id: idFrom('ciqual:7200'),
  name: 'Pain de mie, courant',
  macrosPer100g: Macros.reconstitute({ proteinG: 8, carbsG: 50, fatG: 4 }),
  source: FoodSource.CIQUAL,
  servings: [{ label: 'tranche', grams: 25, approximate: true }],
})

const slice: Measure = { label: 'tranche', grams: 25, countable: true, approximate: true }

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
      measure: GRAM,
      amount: 100,
      calories: 170,
      macros: { proteinG: 20, carbsG: 0, fatG: 10 },
    },
  ],
  ...overrides,
})

let saveDraft: ReturnType<typeof vi.fn>
let router: Router

async function mountAt(
  path: string,
  meal = mealOf(),
  recent: ReadonlyMap<string, { grams: number; measure: string }> = new Map(),
  inventory: Record<string, unknown> = {},
): Promise<VueWrapper> {
  saveDraft = vi.fn(async () => ok({ id: meal.mealId }))

  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player) } as never,
      inventory: {
        getMeal: succeedsWith(meal),
        getFood: { execute: async (id: string) => ok([chicken, bread].find((food) => food.id === id) ?? null) },
        saveDraft: { execute: saveDraft },
        find: succeedsWith({ kind: 'by_name', items: [chicken, bread], excluded: [], onlineSearched: true }),
        recentPortions: succeedsWith(recent),
        ...inventory,
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
      { path: '/garde-manger/aliments/nouveau', name: ROUTE.customFood, component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Enregistre le brouillon avec le bouton du pied de page. */
async function save(wrapper: VueWrapper): Promise<void> {
  const button = wrapper.findAll('.editor__footer button').find((candidate) => candidate.text().includes('Enregistrer'))
  await button!.trigger('click')
  await flushPromises()
}

describe('MealEditorView — repas existant', () => {
  const field = (wrapper: VueWrapper) => wrapper.find('.stepper__field input')

  it('expose la portion de chaque ligne en saisie', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    expect((field(wrapper).element as HTMLInputElement).value).toBe('100')
  })

  it('corrige la portion sur `change`, sans rien écrire avant l’enregistrement', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    // `setValue` de test-utils émet `input` **et** `change` : on pilote donc
    // l'élément directement pour distinguer les deux moments.
    ;(field(wrapper).element as HTMLInputElement).value = '250'
    await field(wrapper).trigger('input')
    expect(wrapper.find('.editor__entry-kcal').text()).toBe('170 kcal')

    await field(wrapper).trigger('change')
    expect(wrapper.find('.editor__entry-kcal').text()).toBe('425 kcal')
    expect(wrapper.find('.editor__total-kcal').text()).toBe('425')
    expect(wrapper.text()).toContain('Changements pas encore enregistrés.')
    expect(saveDraft).not.toHaveBeenCalled()

    await save(wrapper)
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mealId: idFrom('meal-1'),
        lines: [{ entryId: idFrom('entry-1'), foodItemId: chicken.id, grams: 250, measure: 'g' }],
      }),
    )
    expect(router.currentRoute.value.name).toBe(ROUTE.weekPlan)
  })

  it.each(['', '0', '-5', 'abc'])('ignore une saisie inexploitable (%p)', async (value) => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    ;(field(wrapper).element as HTMLInputElement).value = value
    await field(wrapper).trigger('change')

    // La personne est en train de retaper son nombre : refuser bruyamment
    // serait pire que ne rien faire.
    expect(wrapper.text()).not.toContain('Changements pas encore enregistrés.')
  })

  it('saisit une ligne en portions dans sa mesure, et la convertit en grammes', async () => {
    const toast = {
      entryId: idFrom('entry-1'),
      foodItemId: bread.id,
      foodName: 'Pain de mie, courant',
      grams: 50,
      measure: slice,
      amount: 2,
      calories: 140,
      macros: { proteinG: 4, carbsG: 25, fatG: 2 },
    }
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf({ entries: [toast] }))

    expect((field(wrapper).element as HTMLInputElement).value).toBe('2')
    expect(wrapper.find('.stepper__unit').text()).toBe('tranches')

    await wrapper.findAll('.stepper__button')[1]!.trigger('click')
    expect((field(wrapper).element as HTMLInputElement).value).toBe('2.5')

    ;(field(wrapper).element as HTMLInputElement).value = '3'
    await field(wrapper).trigger('change')
    await save(wrapper)
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ grams: 75, measure: 'tranche' })] }),
    )
  })

  it('permet de retirer une ligne, sous un nom accessible distinct', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    const remove = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Retirer Blanc de poulet'))
    await remove!.trigger('click')

    expect(wrapper.findAll('.editor__entry')).toHaveLength(0)
    expect(wrapper.find('.editor__feedback').text()).toBe('Blanc de poulet retiré.')
  })

  it('propose « Mangé » pour un repas du jour', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    expect(wrapper.find('[aria-pressed]').exists()).toBe(true)
  })

  it('ne propose « Mangé » qu’une fois les changements enregistrés', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1')

    ;(field(wrapper).element as HTMLInputElement).value = '250'
    await field(wrapper).trigger('change')

    expect(wrapper.find('[aria-pressed]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Enregistrez d’abord le repas.')
  })

  it('ne propose pas « Mangé » pour un repas à venir', async () => {
    // Le domaine le refuserait : un bouton voué à l'échec n'a rien à faire là.
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf({ plannedFor: tomorrow }))

    expect(wrapper.find('[aria-pressed]').exists()).toBe(false)
  })
})

describe('MealEditorView — quitter sans enregistrer', () => {
  async function changed(): Promise<VueWrapper> {
    const wrapper = await mountAt('/semaine/repas/meal-1')
    const input = wrapper.find('.stepper__field input')
    ;(input.element as HTMLInputElement).value = '250'
    await input.trigger('change')
    return wrapper
  }

  const dialogButton = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((button) => button.textContent?.trim() === label)!

  it('demande avant de partir, et reste si on le choisit', async () => {
    await changed()

    const leaving = router.push('/semaine')
    await flushPromises()
    expect(document.querySelector('dialog')?.open).toBe(true)
    expect(document.activeElement?.textContent?.trim()).toBe('Rester')

    dialogButton('Rester').click()
    await leaving
    expect(router.currentRoute.value.name).toBe(ROUTE.mealEditor)
  })

  it('part et oublie les changements si on le confirme', async () => {
    await changed()

    const leaving = router.push('/semaine')
    await flushPromises()
    dialogButton('Quitter sans enregistrer').click()
    await leaving

    expect(router.currentRoute.value.name).toBe(ROUTE.weekPlan)
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('part sans rien demander quand il n’y a rien à enregistrer', async () => {
    await mountAt('/semaine/repas/meal-1')

    await router.push('/semaine')

    expect(router.currentRoute.value.name).toBe(ROUTE.weekPlan)
    expect(document.querySelector('dialog')?.open).toBeFalsy()
  })

  it('garde le brouillon pendant le détour pour créer un aliment', async () => {
    await changed()

    await router.push('/garde-manger/aliments/nouveau')
    expect(router.currentRoute.value.name).toBe(ROUTE.customFood)
    await router.push('/semaine/repas/meal-1?aliment=ciqual:7200')
    await flushPromises()

    expect((document.querySelector('.stepper__field input') as HTMLInputElement).value).toBe('250')
  })
})

describe('MealEditorView — repas pris', () => {
  const eaten = () => mealOf({ consumedAt: `${today}T12:45:00.000Z` })

  it('retire toute commande de modification', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', eaten())

    expect(wrapper.find('.stepper__field input').exists()).toBe(false)
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
    expect(wrapper.text()).toContain('Pour le changer, décochez d’abord « Mangé »')
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
    expect(wrapper.text()).toContain('Rien dans l’assiette pour l’instant.')
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('n’enregistre pas un repas vide, et dit pourquoi', async () => {
    const wrapper = await mountAt(`/semaine/repas?jour=${tomorrow}&type=DINNER`)
    const button = wrapper.findAll('.editor__footer button').find((candidate) => candidate.text().includes('Enregistrer'))!

    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('aria-describedby')).toBe('raison-enregistrer')
    expect(wrapper.find('#raison-enregistrer').text()).toBe('Ajoutez au moins un aliment pour enregistrer.')

    await button.trigger('click')
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('crée le repas à l’enregistrement, au jour et au type choisis', async () => {
    const wrapper = await mountAt(`/semaine/repas?jour=${tomorrow}&type=DINNER`)

    await wrapper.find('input[type="search"], .picker__search input').setValue('poulet')
    await wrapper.find('form.picker__search').trigger('submit')
    await flushPromises()
    await wrapper.find(`input[name="food"][value="${chicken.id}"]`).setValue(true)
    const add = wrapper.findAll('button').find((button) => button.text().startsWith('Ajouter Blanc'))
    await add!.trigger('click')
    await flushPromises()
    expect(saveDraft).not.toHaveBeenCalled()
    expect(wrapper.find('.editor__total-kcal').text()).toBe('170')

    await save(wrapper)
    expect(saveDraft).toHaveBeenCalledWith({
      playerId,
      schedule: { plannedFor: tomorrow, type: MealType.DINNER },
      lines: [{ foodItemId: chicken.id, grams: 100, measure: 'g' }],
    })
    expect(router.currentRoute.value.name).toBe(ROUTE.weekPlan)
  })

  async function select(wrapper: VueWrapper, food: FoodItem): Promise<void> {
    await wrapper.find('.picker__search input').setValue('pain')
    await wrapper.find('form.picker__search').trigger('submit')
    await flushPromises()
    await wrapper.find(`input[name="food"][value="${food.id}"]`).setValue(true)
  }

  async function addSelected(wrapper: VueWrapper): Promise<void> {
    const add = wrapper.findAll('button').find((button) => button.text().startsWith('Ajouter '))
    await add!.trigger('click')
    await flushPromises()
  }

  it('propose d’emblée la première portion de l’aliment', async () => {
    const wrapper = await mountAt(`/semaine/repas?jour=${today}&type=LUNCH`)
    await select(wrapper, bread)

    expect((wrapper.find('.portion__field input').element as HTMLInputElement).value).toBe('1')
    expect(wrapper.find('.portion__unit').text()).toBe('tranche')
    expect(wrapper.find('.portion__weight').text()).toBe('Soit environ 25 g')

    await wrapper.findAll('.portion__step')[1]!.trigger('click')
    expect(wrapper.find('.portion__unit').text()).toBe('tranche')
    await wrapper.findAll('.portion__step')[1]!.trigger('click')
    expect(wrapper.find('.portion__unit').text()).toBe('tranches')

    await addSelected(wrapper)
    expect(wrapper.find('.editor__feedback').text()).toContain('(2 tranches)')
    expect((wrapper.find('.stepper__field input').element as HTMLInputElement).value).toBe('2')
    expect(wrapper.find('.stepper__unit').text()).toBe('tranches')
  })

  it('reprend la dernière portion saisie pour l’aliment', async () => {
    const wrapper = await mountAt(
      `/semaine/repas?jour=${today}&type=LUNCH`,
      mealOf(),
      new Map([[bread.id, { grams: 75, measure: 'tranche' }]]),
    )
    await select(wrapper, bread)

    expect((wrapper.find('.portion__field input').element as HTMLInputElement).value).toBe('3')
    // La suggestion est déjà appliquée : inutile de la proposer.
    expect(wrapper.find('.portion__recent').exists()).toBe(false)

    await wrapper.find('input[name="portion-measure"][value="g"]').setValue(true)
    expect((wrapper.find('.portion__field input').element as HTMLInputElement).value).toBe('75')
    expect(wrapper.find('.portion__recent').text()).toContain('3 tranches')

    await wrapper.find('.portion__recent').trigger('click')
    await addSelected(wrapper)
    await save(wrapper)
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ grams: 75, measure: 'tranche' })] }),
    )
  })

  it('ignore un jour illisible dans l’adresse', async () => {
    const wrapper = await mountAt('/semaine/repas?jour=2026-02-30&type=LUNCH')

    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe(today)
  })
})

describe('MealEditorView — recettes', () => {
  const pokeBowl = {
    recipeId: idFrom('recipe-1'),
    name: 'Poke bowl',
    lines: [
      {
        foodItemId: chicken.id,
        foodName: 'Blanc de poulet',
        grams: 100,
        measure: GRAM,
        amount: 100,
      },
    ],
  }

  async function search(wrapper: VueWrapper, text: string): Promise<void> {
    await wrapper.find('.picker__search input').setValue(text)
    await wrapper.find('form.picker__search').trigger('submit')
    await flushPromises()
  }

  const recipeButton = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll('.recipes button').find((button) => button.text().startsWith(label))!

  it('ne montre aucune recette tant qu’on ne cherche pas', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([pokeBowl]),
    })

    expect(wrapper.find('.recipes').exists()).toBe(false)
  })

  it('retrouve une recette par son nom, avant les aliments', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([pokeBowl]),
    })

    await search(wrapper, 'POKÉ')
    expect(wrapper.find('.recipes').exists()).toBe(true)
    expect(wrapper.find('.recipes').text()).toContain('Blanc de poulet (100 g)')

    await search(wrapper, 'pain')
    expect(wrapper.find('.recipes').exists()).toBe(false)
  })

  it('ne dit pas « aucun aliment » quand une recette répond', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([pokeBowl]),
      find: succeedsWith({ kind: 'by_name', items: [], excluded: [], onlineSearched: true }),
    })

    await search(wrapper, 'poke')

    expect(wrapper.text()).not.toContain('Aucun aliment trouvé')
  })

  it('ajoute une recette au repas en cours, puis le dit', async () => {
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([pokeBowl]),
    })

    await search(wrapper, 'poke')
    await recipeButton(wrapper, 'Ajouter').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.editor__entry')).toHaveLength(2)
    expect(wrapper.find('.editor__feedback').text()).toBe('Poke bowl ajoutée (1 aliment).')
  })

  it('nomme les aliments qui manquent au catalogue', async () => {
    const salmon = { foodItemId: idFrom('ciqual:disparu'), foodName: 'Saumon cru', grams: 80, measure: GRAM, amount: 80 }
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([{ ...pokeBowl, lines: [...pokeBowl.lines, salmon] }]),
    })

    await search(wrapper, 'poke')
    await recipeButton(wrapper, 'Ajouter').trigger('click')
    await flushPromises()

    expect(wrapper.find('.editor__feedback').text()).toContain('Saumon cru')
  })

  it('garde le repas en cours comme recette et vide le champ', async () => {
    const saveAsRecipe = vi.fn(async () => ok(pokeBowl))
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      saveAsRecipe: { execute: saveAsRecipe },
    })

    const input = wrapper.find('.save input')
    await input.setValue('Poke bowl')
    await wrapper.find('.save').trigger('submit')
    await flushPromises()

    expect(saveAsRecipe).toHaveBeenCalledWith(idFrom('meal-1'), 'Poke bowl')
    expect(wrapper.find('.editor__feedback').text()).toBe('Recette « Poke bowl » enregistrée.')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('n’enregistre pas une recette sans nom', async () => {
    const saveAsRecipe = vi.fn(async () => ok(pokeBowl))
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      saveAsRecipe: { execute: saveAsRecipe },
    })

    await wrapper.find('.save input').setValue('   ')
    await wrapper.find('.save').trigger('submit')

    expect(saveAsRecipe).not.toHaveBeenCalled()
  })

  it('demande confirmation avant de supprimer une recette', async () => {
    const deleteRecipe = vi.fn(async () => ok(undefined))
    const wrapper = await mountAt('/semaine/repas/meal-1', mealOf(), new Map(), {
      listRecipes: succeedsWith([pokeBowl]),
      deleteRecipe: { execute: deleteRecipe },
    })

    await search(wrapper, 'poke')
    await recipeButton(wrapper, 'Supprimer').trigger('click')
    expect(deleteRecipe).not.toHaveBeenCalled()

    await recipeButton(wrapper, 'Oui, supprimer').trigger('click')
    await flushPromises()

    expect(deleteRecipe).toHaveBeenCalledWith(idFrom('recipe-1'))
    expect(wrapper.find('.editor__feedback').text()).toBe('Recette « Poke bowl » supprimée.')
  })

  it('ne cherche ni n’ajoute rien dans un repas mangé, mais permet de le garder', async () => {
    const wrapper = await mountAt(
      '/semaine/repas/meal-1',
      mealOf({ consumedAt: '2026-04-10T12:45:00.000Z' }),
      new Map(),
      { listRecipes: succeedsWith([pokeBowl]) },
    )

    expect(wrapper.find('.picker__search').exists()).toBe(false)
    expect(wrapper.text()).toContain('Garder comme recette')
  })
})
