import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeContainer, failsWith, succeedsWith } from '@/app/__tests__/fakeContainer'
import { provideContainer, resetContainer } from '@/app/container'
import { ApplicationError, InvalidMacrosError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { MealType } from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'

const playerId: PlayerId = idFrom('player-1')

const chicken = FoodItem.reconstitute({
  id: idFrom('ciqual:36007'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
  source: FoodSource.CIQUAL,
})

const mealOf = (calories: number, consumedAt: string | null) => ({
  mealId: idFrom('meal-1'),
  playerId,
  type: MealType.LUNCH,
  loggedAt: '2026-04-10T12:30:00.000Z',
  plannedFor: '2026-04-10',
  consumedAt,
  entryCount: 1,
  macros: { proteinG: 20, carbsG: 0, fatG: 10 },
  calories,
  entries: [],
})

const journalOf = (calories: number) => {
  const meal = mealOf(calories, '2026-04-10T12:45:00.000Z')
  return {
    day: '2026-04-10',
    meals: [meal],
    consumedMeals: [meal],
    totalCalories: calories,
  }
}

/** Journal dont l'unique repas est composé mais pas encore pris. */
const plannedJournalOf = (calories: number) => ({
  day: '2026-04-10',
  meals: [mealOf(calories, null)],
  consumedMeals: [],
  totalCalories: 0,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  resetContainer()
})

describe('useJournalStore', () => {
  it('part d’un journal vide', () => {
    provideContainer(createFakeContainer())
    const store = useJournalStore()

    expect(store.isEmpty).toBe(true)
    expect(store.totalCalories).toBe(0)
    expect(store.status).toBe('idle')
  })

  it('déplie un Result en succès', async () => {
    provideContainer(
      createFakeContainer({ inventory: { journal: succeedsWith(journalOf(170)) } as never }),
    )
    const store = useJournalStore()

    expect(await store.load(playerId, new Date('2026-04-10T10:00:00'))).toBe(true)
    expect(store.status).toBe('ready')
    expect(store.meals).toHaveLength(1)
    expect(store.totalCalories).toBe(170)
  })

  it('expose une erreur typée en cas d’échec', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          journal: failsWith(new ApplicationError('JOURNAL_UNREADABLE', 'illisible')),
        } as never,
      }),
    )
    const store = useJournalStore()

    expect(await store.load(playerId)).toBe(false)
    expect(store.status).toBe('error')
    expect(store.error).toEqual({
      kind: 'application',
      code: 'JOURNAL_UNREADABLE',
      message: 'illisible',
    })
  })

  it('mémorise la journée demandée', async () => {
    provideContainer(
      createFakeContainer({ inventory: { journal: succeedsWith(journalOf(0)) } as never }),
    )
    const store = useJournalStore()
    const date = new Date('2026-04-10T10:00:00')

    await store.load(playerId, date)

    expect(store.day).toBe(date)
  })

  describe('modifications', () => {
    it('n’expose en consumedMeals que les repas pris', async () => {
      provideContainer(
        createFakeContainer({
          inventory: { journal: succeedsWith(plannedJournalOf(170)) } as never,
        }),
      )
      const store = useJournalStore()

      await store.load(playerId)

      // Le repas figure bien au journal — il est simplement hors des totaux.
      expect(store.meals).toHaveLength(1)
      expect(store.consumedMeals).toEqual([])
      expect(store.totalCalories).toBe(0)
    })

    it('remonte l’échec du marquage sans relire le journal', async () => {
      const journal = vi.fn(async () => ({ ok: true as const, value: journalOf(0) }))
      provideContainer(
        createFakeContainer({
          inventory: {
            journal: { execute: journal },
            markConsumed: failsWith(new ApplicationError('MEAL_NOT_FOUND', 'introuvable')),
          } as never,
        }),
      )
      const store = useJournalStore()

      expect(await store.setConsumed(playerId, idFrom('m'), true)).toBe(false)
      expect(store.error?.code).toBe('MEAL_NOT_FOUND')
      expect(journal).not.toHaveBeenCalled()
    })

    it('relit le journal après un marquage réussi', async () => {
      const journal = vi.fn(async () => ({ ok: true as const, value: journalOf(0) }))
      provideContainer(
        createFakeContainer({
          inventory: { journal: { execute: journal }, markConsumed: succeedsWith(null) } as never,
        }),
      )
      const store = useJournalStore()

      expect(await store.setConsumed(playerId, idFrom('m'), true)).toBe(true)
      expect(journal).toHaveBeenCalledTimes(1)
    })
  })
})

describe('useFoodSearchStore', () => {
  const resultsOf = (
    items: readonly unknown[],
    extra: { kind?: string; onlineSearched?: boolean } = {},
  ) =>
    succeedsWith({
      kind: extra.kind ?? 'by_name',
      items,
      onlineSearched: extra.onlineSearched ?? true,
    })

  it('déplie les résultats fusionnés', async () => {
    provideContainer(createFakeContainer({ inventory: { find: resultsOf([chicken]) } as never }))
    const store = useFoodSearchStore()

    expect(await store.find('poulet')).toBe(true)
    expect(store.hasResults).toBe(true)
    expect(store.query).toBe('poulet')
    expect(store.results[0]?.name).toBe('Blanc de poulet')
    expect(store.onlineSearchUnavailable).toBe(false)
  })

  it('expose une erreur typée quand la recherche échoue', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          find: failsWith(new ApplicationError('CATALOG_UNREADABLE', 'panne')),
        } as never,
      }),
    )
    const store = useFoodSearchStore()

    expect(await store.find('poulet')).toBe(false)
    expect(store.error?.code).toBe('CATALOG_UNREADABLE')
  })

  it('signale que le distant n’a pas répondu', async () => {
    provideContainer(
      createFakeContainer({
        inventory: { find: resultsOf([chicken], { onlineSearched: false }) } as never,
      }),
    )
    const store = useFoodSearchStore()

    await store.find('poulet')

    // C'est ce drapeau que l'UI traduit en « résultats du catalogue local
    // uniquement » plutôt qu'en liste complète.
    expect(store.onlineSearchUnavailable).toBe(true)
    expect(store.results).toHaveLength(1)
  })

  it('distingue un code-barres introuvable d’une recherche par nom infructueuse', async () => {
    provideContainer(
      createFakeContainer({
        inventory: { find: resultsOf([], { kind: 'by_barcode' }) } as never,
      }),
    )
    const store = useFoodSearchStore()

    await store.find('9999999999993')

    expect(store.unknownBarcode).toBe(true)
  })

  it('ne parle pas de code-barres inconnu quand le distant s’est tu', async () => {
    provideContainer(
      createFakeContainer({
        inventory: {
          find: resultsOf([], { kind: 'by_barcode', onlineSearched: false }),
        } as never,
      }),
    )
    const store = useFoodSearchStore()

    await store.find('9999999999993')

    // Rien n'autorise à dire « inconnu » d'une base qu'on n'a pas pu consulter.
    expect(store.unknownBarcode).toBe(false)
    expect(store.onlineSearchUnavailable).toBe(true)
  })

  it('oublie le verdict de la recherche précédente', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { kind: 'by_barcode', items: [], onlineSearched: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { kind: 'by_name', items: [chicken], onlineSearched: true },
      })
    provideContainer(createFakeContainer({ inventory: { find: { execute } } as never }))
    const store = useFoodSearchStore()

    await store.find('3017620422003')
    expect(store.onlineSearchUnavailable).toBe(true)

    await store.find('poulet')

    // Sans la remise à zéro, le bandeau survivrait à une requête qui, elle,
    // a bien atteint Open Food Facts.
    expect(store.onlineSearchUnavailable).toBe(false)
    expect(store.unknownBarcode).toBe(false)
  })

  describe('createCustomFood', () => {
    it('retourne l’aliment créé', async () => {
      provideContainer(
        createFakeContainer({ inventory: { createCustomFood: succeedsWith(chicken) } as never }),
      )
      const store = useFoodSearchStore()

      const created = await store.createCustomFood({
        name: 'Blanc de poulet',
        proteinG: 20,
        carbsG: 0,
        fatG: 10,
      })

      expect(created?.id).toBe(chicken.id)
      expect(store.results).toHaveLength(1)
    })

    it('retourne null et expose l’erreur de domaine', async () => {
      provideContainer(
        createFakeContainer({
          inventory: { createCustomFood: failsWith(new InvalidMacrosError('négatif')) } as never,
        }),
      )
      const store = useFoodSearchStore()

      const created = await store.createCustomFood({
        name: 'X',
        proteinG: -1,
        carbsG: 0,
        fatG: 0,
      })

      expect(created).toBeNull()
      expect(store.error?.kind).toBe('domain')
      expect(store.error?.code).toBe('INVALID_MACROS')
    })
  })

  it('remet tout à zéro', async () => {
    provideContainer(createFakeContainer({ inventory: { find: resultsOf([chicken]) } as never }))
    const store = useFoodSearchStore()
    await store.find('poulet')

    store.reset()

    expect(store.query).toBe('')
    expect(store.results).toEqual([])
    expect(store.status).toBe('idle')
    expect(store.searchKind).toBeNull()
  })
})
