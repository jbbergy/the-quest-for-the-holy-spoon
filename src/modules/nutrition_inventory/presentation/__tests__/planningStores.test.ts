import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { type DayKey, parseDayKey } from '@/core/day'
import { ApplicationError, InvalidMealError } from '@/core/errors'
import { idFrom, type MealId, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { MealType } from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { GRAM } from '@/modules/nutrition_inventory/domain/Measure'
import { useMealEditorStore } from '@/modules/nutrition_inventory/presentation/useMealEditorStore'
import { useWeekPlanStore } from '@/modules/nutrition_inventory/presentation/useWeekPlanStore'

const playerId: PlayerId = idFrom('player-1')
const mealId: MealId = idFrom('meal-1')

const day = (text: string): DayKey => {
  const parsed = parseDayKey(text)
  if (parsed === null) throw new Error(`jour de test invalide : ${text}`)
  return parsed
}

const summaryOf = (overrides: Record<string, unknown> = {}) => ({
  mealId,
  playerId,
  type: MealType.DINNER,
  loggedAt: '2026-09-20T18:00:00.000Z',
  plannedFor: '2026-09-24',
  consumedAt: null,
  entryCount: 1,
  macros: { proteinG: 20, carbsG: 0, fatG: 10 },
  detail: { fiberG: 0, sugarsG: 0, saturatedFatG: 0, saltG: 0 },
  calories: 170,
  entries: [],
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useWeekPlanStore', () => {
  it('cale la semaine sur son lundi, quel que soit le jour demandé', async () => {
    const week = vi.fn(async () => ({ ok: true as const, value: { days: [] } }))
    provideContainer(createFakeContainer({ inventory: { week: { execute: week } } as never }))
    const store = useWeekPlanStore()

    await store.load(playerId, day('2026-09-24'))

    expect(store.weekStart).toBe('2026-09-21')
    expect(week).toHaveBeenCalledWith(playerId, '2026-09-21')
  })

  it('met à jour les repas prévus de la semaine avant de la lire', async () => {
    const calls: string[] = []
    const refreshPlanned = vi.fn(async () => {
      calls.push('refresh')
      return { ok: true as const, value: 0 }
    })
    const week = vi.fn(async () => {
      calls.push('week')
      return { ok: true as const, value: { days: [] } }
    })
    provideContainer(
      createFakeContainer({
        inventory: { week: { execute: week }, refreshPlanned: { execute: refreshPlanned } } as never,
      }),
    )

    await useWeekPlanStore().load(playerId, day('2026-09-24'))

    expect(refreshPlanned).toHaveBeenCalledWith(playerId, '2026-09-21', '2026-09-27')
    expect(calls).toEqual(['refresh', 'week'])
  })

  it('affiche la semaine même quand la mise à jour des repas prévus échoue', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          refreshPlanned: failsWith(new ApplicationError('MEALS_UNREADABLE', 'illisible')),
        } as never,
      }),
    )
    const store = useWeekPlanStore()

    expect(await store.load(playerId, day('2026-09-24'))).toBe(true)
    expect(store.error).toBeNull()
  })

  it('relit la semaine après une suppression', async () => {
    const week = vi.fn(async () => ({ ok: true as const, value: { days: [] } }))
    provideContainer(
      createFakeContainer({
        inventory: { week: { execute: week }, deleteMeal: succeedsWith(undefined) } as never,
      }),
    )
    const store = useWeekPlanStore()
    await store.load(playerId, day('2026-09-24'))

    expect(await store.deleteMeal(playerId, mealId)).toBe(true)
    expect(week).toHaveBeenLastCalledWith(playerId, '2026-09-21')
    expect(week).toHaveBeenCalledTimes(2)
  })

  it('remonte le refus d’un marquage sans relire la semaine', async () => {
    const week = vi.fn(async () => ({ ok: true as const, value: { days: [] } }))
    provideContainer(
      createFakeContainer({
        inventory: {
          week: { execute: week },
          markConsumed: failsWith(new InvalidMealError('Un repas prévu pour un jour à venir…')),
        } as never,
      }),
    )
    const store = useWeekPlanStore()

    expect(await store.setConsumed(playerId, mealId, true)).toBe(false)
    expect(store.error?.code).toBe('INVALID_MEAL')
    expect(week).not.toHaveBeenCalled()
  })

  it('expose une erreur typée quand la semaine est illisible', async () => {
    provideContainer(
      createFakeContainer({
        inventory: { week: failsWith(new ApplicationError('WEEK_UNREADABLE', 'illisible')) } as never,
      }),
    )
    const store = useWeekPlanStore()

    expect(await store.load(playerId)).toBe(false)
    expect(store.error?.code).toBe('WEEK_UNREADABLE')
  })
})

describe('useMealEditorStore', () => {
  const chicken = FoodItem.reconstitute({
    id: idFrom('ciqual:36007'),
    name: 'Blanc de poulet',
    macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
    source: FoodSource.CIQUAL,
  })

  const savedWithChicken = () =>
    summaryOf({
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
    })

  it('ne crée rien en base pour un brouillon', () => {
    provideContainer(createFakeContainer())
    const store = useMealEditorStore()

    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    expect(store.meal).toBeNull()
    expect(store.schedule).toEqual({ plannedFor: '2026-09-24', type: MealType.DINNER })
    expect(store.isDirty).toBe(false)
  })

  it('compose sans rien écrire, et recalcule les totaux à chaque geste', () => {
    const saveDraft = vi.fn()
    provideContainer(createFakeContainer({ inventory: { saveDraft: { execute: saveDraft } } as never }))
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    store.addFood(chicken, 150, GRAM)
    expect(store.totals.calories).toBeCloseTo(255)
    expect(store.isDirty).toBe(true)

    store.changeGrams(store.draft.lines[0]!.key, 200)
    expect(store.totals.macros.proteinG).toBeCloseTo(40)

    store.reschedule({ plannedFor: day('2026-09-25'), type: MealType.LUNCH })
    expect(store.schedule).toEqual({ plannedFor: '2026-09-25', type: MealType.LUNCH })
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('enregistre le brouillon en une fois, puis relit le repas', async () => {
    const saveDraft = vi.fn(async () => ({ ok: true as const, value: { id: mealId } }))
    provideContainer(
      createFakeContainer({
        inventory: { saveDraft: { execute: saveDraft }, getMeal: succeedsWith(savedWithChicken()) } as never,
      }),
    )
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })
    store.addFood(chicken, 150, GRAM)

    expect(await store.save(playerId)).toBe(true)

    expect(saveDraft).toHaveBeenCalledWith({
      playerId,
      schedule: { plannedFor: '2026-09-24', type: MealType.DINNER },
      lines: [{ foodItemId: chicken.id, grams: 150, measure: 'g' }],
    })
    expect(store.mealId).toBe(mealId)
    expect(store.isDirty).toBe(false)
  })

  it('désigne les lignes déjà enregistrées d’un repas ouvert', async () => {
    const saveDraft = vi.fn(async () => ({ ok: true as const, value: { id: mealId } }))
    provideContainer(
      createFakeContainer({
        inventory: { saveDraft: { execute: saveDraft }, getMeal: succeedsWith(savedWithChicken()) } as never,
      }),
    )
    const store = useMealEditorStore()
    await store.open(mealId)
    store.changeGrams('entry-1', 120)

    await store.save(playerId)

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        mealId,
        lines: [{ entryId: 'entry-1', foodItemId: chicken.id, grams: 120, measure: 'g' }],
      }),
    )
  })

  it('garde le brouillon et dit l’erreur quand l’enregistrement échoue', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          saveDraft: failsWith(new ApplicationError('FOOD_NOT_FOUND', 'disparu')),
        } as never,
      }),
    )
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })
    store.addFood(chicken, 150, GRAM)

    expect(await store.save(playerId)).toBe(false)
    expect(store.error?.code).toBe('FOOD_NOT_FOUND')
    expect(store.draft.lines).toHaveLength(1)
    expect(store.isDirty).toBe(true)
  })

  it('reprend le brouillon mis de côté pendant un détour', async () => {
    provideContainer(createFakeContainer({ inventory: { getMeal: succeedsWith(savedWithChicken()) } as never }))
    const store = useMealEditorStore()
    await store.open(mealId)
    store.removeLine('entry-1')

    store.keepForDetour()
    await store.open(mealId)
    expect(store.draft.lines).toHaveLength(0)

    // Sans détour annoncé, rouvrir le repas repart de ce qui est enregistré.
    await store.open(mealId)
    expect(store.draft.lines).toHaveLength(1)
  })

  it('oublie les changements sur demande', async () => {
    provideContainer(createFakeContainer({ inventory: { getMeal: succeedsWith(savedWithChicken()) } as never }))
    const store = useMealEditorStore()
    await store.open(mealId)
    store.changeGrams('entry-1', 300)

    store.discard()

    expect(store.draft.lines[0]!.grams).toBe(100)
    expect(store.isDirty).toBe(false)
  })

  it('ajoute une recette en nommant ce qui manque au catalogue', async () => {
    const getFood = vi.fn(async (id: string) => ({ ok: true as const, value: id === chicken.id ? chicken : null }))
    provideContainer(createFakeContainer({ inventory: { getFood: { execute: getFood } } as never }))
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    const result = await store.addRecipe({
      recipeId: idFrom('recipe-1'),
      name: 'Poke bowl',
      lines: [
        { foodItemId: chicken.id, foodName: 'Blanc de poulet', grams: 100, measure: GRAM, amount: 100 },
        { foodItemId: idFrom('ciqual:disparu'), foodName: 'Saumon cru', grams: 80, measure: GRAM, amount: 80 },
      ],
    })

    expect(result).toEqual({ added: 1, missing: ['Saumon cru'] })
    expect(store.draft.lines.map((line) => line.foodName)).toEqual(['Blanc de poulet'])
  })
})
