// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import JournalView from '@/app/views/JournalView.vue'
import { idFrom, type PlayerId } from '@/core/identity'
import { ok } from '@/core/result'
import { MealType } from '@/modules/nutrition_inventory/application'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex, BodyMeasurements } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

const playerId: PlayerId = idFrom('player-1')

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

const mealOf = (consumedAt: string | null) => ({
  mealId: idFrom('meal-1'),
  playerId,
  type: MealType.LUNCH,
  loggedAt: '2026-04-10T12:30:00.000Z',
  consumedAt,
  entryCount: 1,
  macros: { proteinG: 20, carbsG: 0, fatG: 10 },
  detail: { fiberG: 0, sugarsG: 0, saturatedFatG: 3, saltG: 0.2 },
  calories: 170,
  entries: [
    {
      entryId: idFrom('entry-1'),
      foodItemId: idFrom('ciqual:36007'),
      foodName: 'Blanc de poulet',
      grams: 100,
      calories: 170,
    },
  ],
})

const journalOf = (consumedAt: string | null) => {
  const meal = mealOf(consumedAt)
  const eaten = consumedAt !== null
  return {
    day: '2026-04-10',
    meals: [meal],
    consumedMeals: eaten ? [meal] : [],
    totalCalories: eaten ? meal.calories : 0,
    totalMacros: eaten ? meal.macros : { proteinG: 0, carbsG: 0, fatG: 0 },
    totalDetail: eaten ? meal.detail : { fiberG: 0, sugarsG: 0, saturatedFatG: 0, saltG: 0 },
  }
}

let changeQuantity: ReturnType<typeof vi.fn>
let removeEntry: ReturnType<typeof vi.fn>

async function mountWith(consumedAt: string | null): Promise<VueWrapper> {
  changeQuantity = vi.fn(async () => ok(null))
  removeEntry = vi.fn(async () => ok(null))

  provideContainer(
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player) } as never,
      inventory: {
        journal: succeedsWith(journalOf(consumedAt)),
        changeQuantity: { execute: changeQuantity },
        removeEntry: { execute: removeEntry },
      } as never,
    }),
  )

  // La garde du routeur charge normalement le profil ; ici on le fait à la main.
  await usePlayerStore().load()

  const wrapper = mount(JournalView)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
  vi.restoreAllMocks()
})

describe('JournalView — modification d’un repas', () => {
  describe('repas prévu', () => {
    it('expose la portion de chaque ligne en saisie', async () => {
      const wrapper = await mountWith(null)

      const input = wrapper.find('.journal__grams input')
      expect(input.exists()).toBe(true)
      expect((input.element as HTMLInputElement).value).toBe('100')
    })

    it('corrige la portion sur `change`, pas à chaque frappe', async () => {
      const wrapper = await mountWith(null)
      const input = wrapper.find('.journal__grams input')

      // `setValue` de test-utils émet `input` **et** `change` : on pilote donc
      // l'élément directement pour distinguer les deux moments.
      ;(input.element as HTMLInputElement).value = '250'
      await input.trigger('input')

      // Rien ne part tant que la saisie n'est pas finie : sinon « 250 »
      // écrirait d'abord 2, puis 25 — deux écritures et deux relectures pour
      // rien.
      expect(changeQuantity).not.toHaveBeenCalled()

      await input.trigger('change')
      expect(changeQuantity).toHaveBeenCalledWith(idFrom('meal-1'), idFrom('entry-1'), 250)
    })

    it.each(['', '0', '-5', 'abc'])('ignore une saisie inexploitable (%p)', async (value) => {
      const wrapper = await mountWith(null)
      const input = wrapper.find('.journal__grams input')

      ;(input.element as HTMLInputElement).value = value
      await input.trigger('change')

      // L'usager est en train de retaper son nombre : refuser bruyamment serait
      // pire que ne rien faire.
      expect(changeQuantity).not.toHaveBeenCalled()
    })

    it('permet de retirer une ligne, sous un nom accessible distinct', async () => {
      const wrapper = await mountWith(null)

      const remove = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Retirer Blanc de poulet'))

      expect(remove).toBeDefined()
      await remove!.trigger('click')
      expect(removeEntry).toHaveBeenCalledWith(idFrom('meal-1'), idFrom('entry-1'))
    })
  })

  describe('repas pris', () => {
    it('retire toute commande de modification', async () => {
      const wrapper = await mountWith('2026-04-10T12:45:00.000Z')

      expect(wrapper.find('.journal__grams input').exists()).toBe(false)
      expect(
        wrapper.findAll('button').some((button) => button.text().includes('Retirer')),
      ).toBe(false)
    })

    it('affiche la portion et dit comment la corriger', async () => {
      const wrapper = await mountWith('2026-04-10T12:45:00.000Z')

      // Masquer les commandes sans expliquer laisserait croire à un bug.
      expect(wrapper.text()).toContain('100 g')
      expect(wrapper.text()).toContain('décochez « Pris » pour le corriger')
    })
  })
})
