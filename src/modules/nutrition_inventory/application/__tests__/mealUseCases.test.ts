import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventBus } from '@/core/EventBus'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { isErr, isOk, ok } from '@/core/result'
import {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  GetDailyJournalUseCase,
  MarkMealConsumedUseCase,
  RemoveMealEntryUseCase,
} from '@/modules/nutrition_inventory/application/useCases'
import {
  MEAL_LOGGED,
  type MealLoggedEvent,
} from '@/modules/nutrition_inventory/application/readModels'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { type Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import {
  InMemoryFoodRepository,
  InMemoryMealRepository,
} from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'

const playerId: PlayerId = idFrom('player-1')

let foods: InMemoryFoodRepository
let meals: InMemoryMealRepository
let events: EventBus

const chicken = FoodItem.reconstitute({
  id: idFrom('ciqual:36007'),
  name: 'Blanc de poulet',
  macrosPer100g: Macros.reconstitute({ proteinG: 20, carbsG: 0, fatG: 10 }),
  detailPer100g: NutrientDetail.reconstitute({
    fiberG: 0,
    sugarsG: 0,
    saturatedFatG: 3,
    saltG: 0.2,
  }),
  source: FoodSource.CIQUAL,
})

const rice = FoodItem.reconstitute({
  id: idFrom('ciqual:39212'),
  name: 'Riz cuit',
  macrosPer100g: Macros.reconstitute({ proteinG: 2.5, carbsG: 28, fatG: 0.3 }),
  source: FoodSource.CIQUAL,
})

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

beforeEach(async () => {
  foods = new InMemoryFoodRepository()
  meals = new InMemoryMealRepository()
  events = new EventBus()
  await foods.saveMany([chicken, rice])
})

describe('AddFoodToMealUseCase', () => {
  const useCase = (): AddFoodToMealUseCase => new AddFoodToMealUseCase(foods, meals, events)

  it('crée un repas et y ajoute l’aliment', async () => {
    const meal = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 150,
        mealType: MealType.LUNCH,
      }),
    )

    expect(meal.entryCount).toBe(1)
    expect(meal.entries[0]?.foodName).toBe('Blanc de poulet')
    expect(meal.calculateTotals().macros.proteinG).toBe(30)
  })

  it('persiste le repas créé', async () => {
    const meal = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )

    const stored = unwrap(await meals.findById(meal.id))
    expect(stored?.entryCount).toBe(1)
  })

  it('complète un repas existant plutôt que d’en créer un second', async () => {
    const first = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )

    const second = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: rice.id,
        grams: 200,
        mealType: MealType.LUNCH,
        mealId: first.id,
      }),
    )

    expect(second.id).toBe(first.id)
    expect(second.entryCount).toBe(2)
  })

  it('fige un instantané, insensible à une correction ultérieure du catalogue', async () => {
    const meal = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )
    const before = meal.calculateTotals()

    await foods.save(chicken.withMacros(Macros.reconstitute({ proteinG: 99, carbsG: 99, fatG: 99 })))

    const stored = unwrap(await meals.findById(meal.id))
    expect(stored?.calculateTotals().macros.equals(before.macros)).toBe(true)
  })

  it('publie MealLoggedEvent avec les totaux du repas', async () => {
    const received: MealLoggedEvent[] = []
    events.on<MealLoggedEvent>(MEAL_LOGGED, (event) => {
      received.push(event)
      return ok(undefined)
    })

    await useCase().execute({
      playerId,
      foodItemId: chicken.id,
      grams: 150,
      mealType: MealType.LUNCH,
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.payload.playerId).toBe(playerId)
    expect(received[0]?.payload.entryCount).toBe(1)
    expect(received[0]?.payload.calories).toBe(30 * 4 + 15 * 9)
  })

  it('enregistre le repas même si un abonné échoue', async () => {
    // La gamification ne doit jamais pouvoir faire échouer le suivi nutritionnel.
    events.on(MEAL_LOGGED, () => {
      throw new Error('gamification en panne')
    })

    const result = await useCase().execute({
      playerId,
      foodItemId: chicken.id,
      grams: 100,
      mealType: MealType.LUNCH,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(unwrap(await meals.findById(result.value.id))).not.toBeNull()
  })

  describe('échecs', () => {
    it('refuse une portion invalide avant toute lecture', async () => {
      const result = await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 0,
        mealType: MealType.LUNCH,
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('INVALID_PORTION')
    })

    it('signale un aliment introuvable', async () => {
      const result = await useCase().execute({
        playerId,
        foodItemId: idFrom('inconnu'),
        grams: 100,
        mealType: MealType.LUNCH,
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('FOOD_NOT_FOUND')
    })

    it('signale un repas introuvable', async () => {
      const result = await useCase().execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
        mealId: idFrom('inconnu'),
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('MEAL_NOT_FOUND')
    })

    it('enveloppe une panne de stockage en erreur applicative, sans perdre la cause', async () => {
      const broken = {
        ...meals,
        save: async () => ({
          ok: false as const,
          error: Object.assign(new Error('disque plein'), { kind: 'repository', code: 'X' }),
        }),
      } as unknown as InMemoryMealRepository

      const result = await new AddFoodToMealUseCase(foods, broken, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error.code).toBe('MEAL_NOT_SAVED')
        expect((result.error.cause as Error).message).toBe('disque plein')
      }
    })

    it('ne publie aucun événement quand l’ajout échoue', async () => {
      const handler = vi.fn(() => ok(undefined))
      events.on(MEAL_LOGGED, handler)

      await useCase().execute({
        playerId,
        foodItemId: idFrom('inconnu'),
        grams: 100,
        mealType: MealType.LUNCH,
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })
})

describe('modification d’un repas', () => {
  const addFood = async (): Promise<Meal> =>
    unwrap(
      await new AddFoodToMealUseCase(foods, meals, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )

  it('change la quantité d’une ligne', async () => {
    const meal = await addFood()
    const entryId = meal.entries[0]!.id

    const updated = unwrap(
      await new ChangeMealEntryQuantityUseCase(meals, events).execute(meal.id, entryId, 250),
    )

    expect(updated.entries[0]?.quantity.grams).toBe(250)
    expect(updated.entries[0]?.macros.proteinG).toBe(50)
  })

  it('refuse une quantité invalide', async () => {
    const meal = await addFood()

    const result = await new ChangeMealEntryQuantityUseCase(meals, events).execute(
      meal.id,
      meal.entries[0]!.id,
      -5,
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_PORTION')
  })

  it('retire une ligne', async () => {
    const meal = await addFood()

    const updated = unwrap(
      await new RemoveMealEntryUseCase(meals, events).execute(meal.id, meal.entries[0]!.id),
    )

    expect(updated.isEmpty).toBe(true)
    expect(unwrap(await meals.findById(meal.id))?.isEmpty).toBe(true)
  })

  it('signale une ligne introuvable', async () => {
    const meal = await addFood()

    const result = await new RemoveMealEntryUseCase(meals, events).execute(
      meal.id,
      idFrom('inconnue'),
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('republie l’événement après modification, pour que les totaux suivent', async () => {
    const meal = await addFood()
    const handler = vi.fn(() => ok(undefined))
    events.on(MEAL_LOGGED, handler)

    await new ChangeMealEntryQuantityUseCase(meals, events).execute(
      meal.id,
      meal.entries[0]!.id,
      200,
    )

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('supprime un repas entier', async () => {
    const meal = await addFood()

    unwrap(await new DeleteMealUseCase(meals).execute(meal.id))

    expect(unwrap(await meals.findById(meal.id))).toBeNull()
  })
})

describe('GetDailyJournalUseCase', () => {
  it('agrège les repas de la journée en read models', async () => {
    const add = new AddFoodToMealUseCase(foods, meals, events)
    const day = new Date('2026-04-10T12:00:00')
    await add.execute({
      playerId,
      foodItemId: chicken.id,
      grams: 100,
      mealType: MealType.LUNCH,
      loggedAt: new Date('2026-04-10T12:30:00'),
    })
    await add.execute({
      playerId,
      foodItemId: rice.id,
      grams: 200,
      mealType: MealType.DINNER,
      loggedAt: new Date('2026-04-10T19:30:00'),
    })
    await add.execute({
      playerId,
      foodItemId: rice.id,
      grams: 100,
      mealType: MealType.LUNCH,
      loggedAt: new Date('2026-04-11T12:30:00'),
    })

    const journal = unwrap(await new GetDailyJournalUseCase(meals).execute(playerId, day))

    expect(journal.day).toBe('2026-04-10')
    expect(journal.meals).toHaveLength(2)
    // Composés, pas encore pris : ils figurent au journal mais ne comptent pas.
    expect(journal.consumedMeals).toEqual([])
    expect(journal.totalCalories).toBe(0)
  })

  it('ne compte que les repas effectivement pris', async () => {
    const add = new AddFoodToMealUseCase(foods, meals, events)
    const day = new Date('2026-04-10T12:00:00')
    const lunch = unwrap(
      await add.execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
        loggedAt: new Date('2026-04-10T12:30:00'),
      }),
    )
    await add.execute({
      playerId,
      foodItemId: rice.id,
      grams: 200,
      mealType: MealType.DINNER,
      loggedAt: new Date('2026-04-10T19:30:00'),
    })

    unwrap(await new MarkMealConsumedUseCase(meals).execute(lunch.id, true))
    const journal = unwrap(await new GetDailyJournalUseCase(meals).execute(playerId, day))

    // Le déjeuner est pris, le dîner seulement prévu : le total est celui du
    // déjeuner seul, et surtout pas la somme des deux.
    expect(journal.meals).toHaveLength(2)
    expect(journal.consumedMeals).toHaveLength(1)
    expect(journal.totalCalories).toBeCloseTo(lunch.calculateTotals().calories, 10)
  })

  it('sort le repas des totaux quand le marquage est annulé', async () => {
    const day = new Date('2026-04-10T12:00:00')
    const lunch = unwrap(
      await new AddFoodToMealUseCase(foods, meals, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
        loggedAt: new Date('2026-04-10T12:30:00'),
      }),
    )
    const mark = new MarkMealConsumedUseCase(meals)
    unwrap(await mark.execute(lunch.id, true))

    unwrap(await mark.execute(lunch.id, false))
    const journal = unwrap(await new GetDailyJournalUseCase(meals).execute(playerId, day))

    expect(journal.totalCalories).toBe(0)
    expect(journal.meals[0]?.consumedAt).toBeNull()
  })

  it('retourne un journal vide pour une journée sans repas', async () => {
    const journal = unwrap(
      await new GetDailyJournalUseCase(meals).execute(playerId, new Date('2026-01-01T10:00:00')),
    )

    expect(journal.meals).toEqual([])
    expect(journal.totalCalories).toBe(0)
  })

  it('n’expose que des read models, jamais des entités modifiables', async () => {
    await new AddFoodToMealUseCase(foods, meals, events).execute({
      playerId,
      foodItemId: chicken.id,
      grams: 100,
      mealType: MealType.LUNCH,
      loggedAt: new Date('2026-04-10T12:30:00'),
    })

    const journal = unwrap(
      await new GetDailyJournalUseCase(meals).execute(playerId, new Date('2026-04-10T12:00:00')),
    )

    const summary = journal.meals[0]!
    expect(summary).not.toHaveProperty('addEntry')
    expect(summary.entries.map((entry) => entry.foodName)).toEqual(['Blanc de poulet'])
    // L'identifiant de ligne voyage avec : sans lui, le journal pourrait
    // afficher les lignes d'un repas mais pas les corriger.
    expect(summary.entries[0]?.entryId).toBeTypeOf('string')
    expect(typeof summary.loggedAt).toBe('string')
  })
})

describe('verrouillage d’un repas pris', () => {
  const eatenMeal = async (): Promise<Meal> => {
    const meal = unwrap(
      await new AddFoodToMealUseCase(foods, meals, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))
    return meal
  }

  it('refuse de corriger la portion d’un repas déjà pris', async () => {
    const meal = await eatenMeal()

    const result = await new ChangeMealEntryQuantityUseCase(meals, events).execute(
      meal.id,
      meal.entries[0]!.id,
      250,
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('refuse d’en retirer une ligne', async () => {
    const meal = await eatenMeal()

    const result = await new RemoveMealEntryUseCase(meals, events).execute(
      meal.id,
      meal.entries[0]!.id,
    )

    expect(isErr(result)).toBe(true)
  })

  it('refuse d’y ajouter un aliment', async () => {
    const meal = await eatenMeal()

    const result = await new AddFoodToMealUseCase(foods, meals, events).execute({
      playerId,
      foodItemId: rice.id,
      grams: 200,
      mealType: MealType.LUNCH,
      mealId: meal.id,
    })

    expect(isErr(result)).toBe(true)
  })

  it('ne publie aucun événement quand la modification est refusée', async () => {
    // Un refus ne doit pas récompenser : sans quoi une tentative avortée
    // rapporterait de l'XP pour un repas qui n'a pas bougé.
    const meal = await eatenMeal()
    const handler = vi.fn(() => ok(undefined))
    events.on(MEAL_LOGGED, handler)

    await new ChangeMealEntryQuantityUseCase(meals, events).execute(
      meal.id,
      meal.entries[0]!.id,
      250,
    )

    expect(handler).not.toHaveBeenCalled()
  })

  it('laisse tout corriger une fois « pris » annulé', async () => {
    const meal = await eatenMeal()
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, false))

    const updated = unwrap(
      await new ChangeMealEntryQuantityUseCase(meals, events).execute(
        meal.id,
        meal.entries[0]!.id,
        250,
      ),
    )

    expect(updated.entries[0]?.quantity.grams).toBe(250)
    // Et le repas reste prévu : l'annulation n'est pas défaite par la correction.
    expect(updated.isConsumed).toBe(false)
  })

  it('ne touche pas à l’instantané en annulant « pris »', async () => {
    /*
     * Verrou d'intention. L'instantané est figé à l'**ajout** de l'aliment, pas
     * à sa consommation : c'est lui qui porte le nom, les macros et les
     * nutriments de la ligne. Le supprimer en décochant « pris » viderait le
     * repas de son contenu au lieu de le libérer.
     */
    const meal = await eatenMeal()
    const before = meal.calculateTotals()

    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, false))
    const after = unwrap(await meals.findById(meal.id))

    expect(after?.calculateTotals().macros.equals(before.macros)).toBe(true)
    expect(after?.entries[0]?.foodName).toBe('Blanc de poulet')
  })
})

describe('totaux du journal', () => {
  const add = (): AddFoodToMealUseCase => new AddFoodToMealUseCase(foods, meals, events)
  const day = new Date('2026-04-10T12:00:00')

  const eat = async (foodItemId: typeof chicken.id, grams: number): Promise<void> => {
    const meal = unwrap(
      await add().execute({
        playerId,
        foodItemId,
        grams,
        mealType: MealType.LUNCH,
        loggedAt: new Date('2026-04-10T12:30:00'),
      }),
    )
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))
  }

  it('agrège macros et nutriments complémentaires en une seule passe', async () => {
    await eat(chicken.id, 150)

    const journal = unwrap(await new GetDailyJournalUseCase(meals).execute(playerId, day))

    expect(journal.totalMacros.proteinG).toBeCloseTo(30, 9)
    expect(journal.totalDetail.saturatedFatG).toBeCloseTo(4.5, 9)
    expect(journal.totalDetail.saltG).toBeCloseTo(0.3, 9)
  })

  it('exclut des totaux un repas composé mais pas pris', async () => {
    await add().execute({
      playerId,
      foodItemId: chicken.id,
      grams: 150,
      mealType: MealType.DINNER,
      loggedAt: new Date('2026-04-10T19:30:00'),
    })

    const journal = unwrap(await new GetDailyJournalUseCase(meals).execute(playerId, day))

    // Même règle que pour les calories : les nutriments complémentaires ne
    // comptent que ce qui a été mangé.
    expect(journal.meals).toHaveLength(1)
    // `toStrictEqual` et non `toEqual` : il vérifie aussi le prototype, donc
    // qu'un objet nu sort du Use Case et non une instance de `NutrientDetail`.
    // Un read model qui laisserait fuir un Value Object donnerait à la
    // présentation des méthodes de domaine à appeler.
    expect(journal.totalDetail).toStrictEqual({
      fiberG: 0,
      sugarsG: 0,
      saturatedFatG: 0,
      saltG: 0,
    })
    expect(journal.totalMacros).toStrictEqual({ proteinG: 0, carbsG: 0, fatG: 0 })
  })

  it('reste à zéro pour une journée sans repas', async () => {
    const journal = unwrap(
      await new GetDailyJournalUseCase(meals).execute(playerId, new Date('2026-01-01T12:00:00')),
    )

    expect(journal.totalCalories).toBe(0)
    expect(journal.totalMacros).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 })
    expect(journal.totalDetail).toEqual({
      fiberG: 0,
      sugarsG: 0,
      saturatedFatG: 0,
      saltG: 0,
    })
  })
})

describe('MarkMealConsumedUseCase', () => {
  const addFood = async (): Promise<Meal> =>
    unwrap(
      await new AddFoodToMealUseCase(foods, meals, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )

  it('persiste le marquage', async () => {
    const meal = await addFood()

    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))

    expect(unwrap(await meals.findById(meal.id))?.isConsumed).toBe(true)
  })

  it('propage le refus du domaine sur un second marquage', async () => {
    const meal = await addFood()
    const useCase = new MarkMealConsumedUseCase(meals)
    unwrap(await useCase.execute(meal.id, true))

    const result = await useCase.execute(meal.id, true)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('signale un repas introuvable', async () => {
    const result = await new MarkMealConsumedUseCase(meals).execute(idFrom('inconnu'), true)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('MEAL_NOT_FOUND')
  })

  it('enveloppe une panne de stockage sans perdre la cause', async () => {
    const meal = await addFood()
    const broken = {
      ...meals,
      findById: async () => ({ ok: true as const, value: meal }),
      save: async () => ({
        ok: false as const,
        error: Object.assign(new Error('disque plein'), { kind: 'repository', code: 'X' }),
      }),
    } as unknown as InMemoryMealRepository

    const result = await new MarkMealConsumedUseCase(broken).execute(meal.id, true)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('MEAL_NOT_SAVED')
      expect((result.error.cause as Error).message).toBe('disque plein')
    }
  })

  it('ne publie aucun événement', async () => {
    // L'XP récompense aujourd'hui l'enregistrement du repas. Republier
    // `MEAL_LOGGED` ici l'attribuerait une seconde fois pour le même repas.
    const meal = await addFood()
    const handler = vi.fn(() => ok(undefined))
    events.on(MEAL_LOGGED, handler)

    await new MarkMealConsumedUseCase(meals).execute(meal.id, true)

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('ExportInventoryUseCase', () => {
  const useCase = (): ExportInventoryUseCase => new ExportInventoryUseCase(meals, foods)

  const addFoodAt = async (loggedAt: Date, grams = 100): Promise<Meal> =>
    unwrap(
      await new AddFoodToMealUseCase(foods, meals, events).execute({
        playerId,
        foodItemId: chicken.id,
        grams,
        mealType: MealType.LUNCH,
        loggedAt,
      }),
    )

  it('exporte tout l’historique, du plus ancien au plus récent', async () => {
    await addFoodAt(new Date('2026-04-11T12:30:00'))
    await addFoodAt(new Date('2026-01-05T12:30:00'))

    const archive = unwrap(await useCase().execute(playerId))

    expect(archive.meals.map((meal) => meal.loggedAt)).toEqual([
      new Date('2026-01-05T12:30:00').toISOString(),
      new Date('2026-04-11T12:30:00').toISOString(),
    ])
  })

  it('conserve le détail des portions, que `MealSummary` ne porte pas', async () => {
    await addFoodAt(new Date('2026-04-10T12:30:00'), 150)

    const archive = unwrap(await useCase().execute(playerId))

    const entry = archive.meals[0]?.entries[0]
    expect(archive.meals[0]?.entries).toHaveLength(1)
    expect(entry).toMatchObject({
      foodName: 'Blanc de poulet',
      grams: 150,
      macros: { proteinG: 30, carbsG: 0, fatG: 15 },
    })

    // Mis à l'échelle de la portion comme les macros : 3 g d'AG saturés et 0,2 g
    // de sel pour 100 g deviennent 4,5 g et 0,3 g pour 150 g. Comparaison
    // approchée — 0,2 × 1,5 ne vaut pas exactement 0,3 en binaire.
    expect(entry?.detail.saturatedFatG).toBeCloseTo(4.5, 6)
    expect(entry?.detail.saltG).toBeCloseTo(0.3, 6)
  })

  it('distingue un repas pris d’un repas seulement prévu', async () => {
    const eaten = await addFoodAt(new Date('2026-04-10T12:30:00'))
    await addFoodAt(new Date('2026-04-10T19:30:00'))
    await new MarkMealConsumedUseCase(meals).execute(eaten.id, true)

    const archive = unwrap(await useCase().execute(playerId))

    expect(archive.meals.filter((meal) => meal.consumedAt !== null)).toHaveLength(1)
    expect(archive.meals.filter((meal) => meal.consumedAt === null)).toHaveLength(1)
  })

  it('n’emporte que les aliments créés par l’utilisateur', async () => {
    // Le catalogue Ciqual est public et régénérable : l'y inclure noierait les
    // seules fiches que l'utilisateur perdrait vraiment.
    const mine = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Gratin de ma grand-mère',
        proteinG: 8,
        carbsG: 12,
        fatG: 9,
      }),
    )

    const archive = unwrap(await useCase().execute(playerId))

    expect(archive.customFoods).toHaveLength(1)
    expect(archive.customFoods[0]).toMatchObject({
      id: mine.id,
      name: 'Gratin de ma grand-mère',
      macrosPer100g: { proteinG: 8, carbsG: 12, fatG: 9 },
      // `null` et non absent : l'archive doit rester relisible sans l'application.
      barcode: null,
    })
  })

  it('ignore l’historique d’un autre joueur', async () => {
    await addFoodAt(new Date('2026-04-10T12:30:00'))

    const archive = unwrap(await useCase().execute(idFrom('player-2')))

    expect(archive.meals).toEqual([])
  })

  it('remonte une erreur d’application quand l’historique est illisible', async () => {
    const broken = {
      ...meals,
      findAllByPlayer: async () => ({
        ok: false as const,
        error: Object.assign(new Error('base corrompue'), { kind: 'repository', code: 'X' }),
      }),
    } as unknown as InMemoryMealRepository

    const result = await new ExportInventoryUseCase(broken, foods).execute(playerId)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('HISTORY_UNREADABLE')
  })

  it('remonte une erreur d’application quand le catalogue est illisible', async () => {
    const broken = {
      ...foods,
      findBySource: async () => ({
        ok: false as const,
        error: Object.assign(new Error('base corrompue'), { kind: 'repository', code: 'X' }),
      }),
    } as unknown as InMemoryFoodRepository

    const result = await new ExportInventoryUseCase(meals, broken).execute(playerId)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('CATALOG_UNREADABLE')
  })
})
