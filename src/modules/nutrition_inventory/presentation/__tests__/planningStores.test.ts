import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { type DayKey, parseDayKey } from '@/core/day'
import { ApplicationError, InvalidMealError } from '@/core/errors'
import { idFrom, type MealId, type PlayerId } from '@/core/identity'
import { MealType } from '@/modules/nutrition_inventory/application'
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
  it('ne crée rien en base pour un brouillon', () => {
    provideContainer(createFakeContainer())
    const store = useMealEditorStore()

    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    expect(store.meal).toBeNull()
    expect(store.schedule).toEqual({ plannedFor: '2026-09-24', type: MealType.DINNER })
  })

  it('crée le repas au premier aliment, au jour et au type du brouillon', async () => {
    const addFood = vi.fn(async () => ({ ok: true as const, value: { id: mealId } }))
    provideContainer(
      createFakeContainer({
        inventory: { addFood: { execute: addFood }, getMeal: succeedsWith(summaryOf()) } as never,
      }),
    )
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    expect(await store.addFood(playerId, idFrom('food-1'), 150)).toBe(true)

    expect(addFood).toHaveBeenCalledWith({
      playerId,
      foodItemId: 'food-1',
      grams: 150,
      mealType: MealType.DINNER,
      plannedFor: '2026-09-24',
    })
    // Le repas créé devient celui qu'on édite : le suivant le complétera.
    expect(store.mealId).toBe(mealId)
  })

  it('complète le repas ouvert plutôt que d’en créer un second', async () => {
    const addFood = vi.fn(async () => ({ ok: true as const, value: { id: mealId } }))
    provideContainer(
      createFakeContainer({
        inventory: { addFood: { execute: addFood }, getMeal: succeedsWith(summaryOf()) } as never,
      }),
    )
    const store = useMealEditorStore()
    await store.open(mealId)

    await store.addFood(playerId, idFrom('food-2'), 80)

    expect(addFood).toHaveBeenCalledWith(expect.objectContaining({ mealId }))
  })

  it('change le jour d’un brouillon sans rien écrire', async () => {
    const reschedule = vi.fn()
    provideContainer(createFakeContainer({ inventory: { reschedule: { execute: reschedule } } as never }))
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    await store.reschedule({ plannedFor: day('2026-09-25'), type: MealType.LUNCH })

    expect(reschedule).not.toHaveBeenCalled()
    expect(store.schedule).toEqual({ plannedFor: '2026-09-25', type: MealType.LUNCH })
  })

  it('revient au jour enregistré quand le déplacement est refusé', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          getMeal: succeedsWith(summaryOf({ consumedAt: '2026-09-24T20:00:00.000Z' })),
          reschedule: failsWith(new InvalidMealError('Un repas déjà pris…')),
        } as never,
      }),
    )
    const store = useMealEditorStore()
    await store.open(mealId)

    const moved = await store.reschedule({ plannedFor: day('2026-09-25'), type: MealType.DINNER })

    expect(moved).toBe(false)
    expect(store.schedule.plannedFor).toBe('2026-09-24')
    expect(store.error?.code).toBe('INVALID_MEAL')
  })

  it('signale un repas pris comme verrouillé', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          getMeal: succeedsWith(summaryOf({ consumedAt: '2026-09-24T20:00:00.000Z' })),
        } as never,
      }),
    )
    const store = useMealEditorStore()

    await store.open(mealId)

    expect(store.isLocked).toBe(true)
  })

  it.each([
    ['removeEntry', (s: ReturnType<typeof useMealEditorStore>) => s.removeEntry(idFrom('e'))],
    [
      'changeQuantity',
      (s: ReturnType<typeof useMealEditorStore>) => s.changeQuantity(idFrom('e'), 200),
    ],
    ['setConsumed', (s: ReturnType<typeof useMealEditorStore>) => s.setConsumed(true)],
  ])('%s relit le repas après succès', async (_label, action) => {
    const getMeal = vi.fn(async () => ({ ok: true as const, value: summaryOf() }))
    provideContainer(
      createFakeContainer({
        inventory: {
          getMeal: { execute: getMeal },
          removeEntry: succeedsWith(null),
          changeQuantity: succeedsWith(null),
          markConsumed: succeedsWith(null),
        } as never,
      }),
    )
    const store = useMealEditorStore()
    await store.open(mealId)

    expect(await action(store)).toBe(true)
    expect(getMeal).toHaveBeenCalledTimes(2)
  })

  it('ne touche à rien tant que le repas n’existe pas', async () => {
    provideContainer(createFakeContainer())
    const store = useMealEditorStore()
    store.startNew({ plannedFor: day('2026-09-24'), type: MealType.DINNER })

    expect(await store.removeEntry(idFrom('e'))).toBe(false)
    expect(await store.setConsumed(true)).toBe(false)
    // Supprimer un brouillon, c'est simplement y renoncer.
    expect(await store.deleteMeal()).toBe(true)
  })

  it('oublie le repas supprimé', async () => {
    provideContainer(
      createFakeContainer({
        inventory: { getMeal: succeedsWith(summaryOf()), deleteMeal: succeedsWith(undefined) } as never,
      }),
    )
    const store = useMealEditorStore()
    await store.open(mealId)

    expect(await store.deleteMeal()).toBe(true)
    expect(store.meal).toBeNull()
  })
})
