import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addDays, type DayKey, dayKeyOf, parseDayKey } from '@/core/day'
import { RepositoryError } from '@/core/errors'
import { err, ok } from '@/core/result'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import { isErr, isOk } from '@/core/result'
import {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  GetMealUseCase,
  GetRecentPortionsUseCase,
  GetWeekPlanUseCase,
  MarkMealConsumedUseCase,
  PlanMealForMembersUseCase,
  RefreshPlannedMealsUseCase,
  RemoveMealEntryUseCase,
  RescalePlannedMealsUseCase,
  RescheduleMealUseCase,
  SaveMealDraftUseCase,
} from '@/modules/nutrition_inventory/application/useCases'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { type Meal, MealType } from '@/modules/nutrition_inventory/domain/Meal'
import {
  InMemoryFoodRepository,
  InMemoryMealRepository,
} from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'

const playerId: PlayerId = idFrom('player-1')

let foods: InMemoryFoodRepository
let meals: InMemoryMealRepository

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
  await foods.saveMany([chicken, rice])
})

const bread = FoodItem.reconstitute({
  id: idFrom('ciqual:7200'),
  name: 'Pain de mie, courant',
  macrosPer100g: Macros.reconstitute({ proteinG: 8, carbsG: 50, fatG: 4 }),
  source: FoodSource.CIQUAL,
  servings: [{ label: 'tranche', grams: 25, approximate: true }],
})

describe('AddFoodToMealUseCase', () => {
  const useCase = (): AddFoodToMealUseCase => new AddFoodToMealUseCase(foods, meals)

  it('garde la mesure de saisie, sans qu’elle change la quantité', async () => {
    await foods.save(bread)
    const meal = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: bread.id,
        grams: 50,
        measure: 'tranche',
        mealType: MealType.BREAKFAST,
      }),
    )

    const entry = meal.entries[0]
    expect(entry?.quantity.grams).toBe(50)
    expect(entry?.measure).toEqual({ label: 'tranche', grams: 25, countable: true, approximate: true })
    expect(entry?.amount).toBe(2)
  })

  it('se rabat sur le gramme pour une mesure que la fiche ne connaît pas', async () => {
    await foods.save(bread)
    const meal = unwrap(
      await useCase().execute({
        playerId,
        foodItemId: bread.id,
        grams: 40,
        measure: 'baguette',
        mealType: MealType.BREAKFAST,
      }),
    )

    expect(meal.entries[0]?.measure.label).toBe('g')
    expect(meal.entries[0]?.quantity.grams).toBe(40)
  })

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

      const result = await new AddFoodToMealUseCase(foods, broken).execute({
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

  })
})

describe('modification d’un repas', () => {
  const addFood = async (): Promise<Meal> =>
    unwrap(
      await new AddFoodToMealUseCase(foods, meals).execute({
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
      await new ChangeMealEntryQuantityUseCase(meals).execute(meal.id, entryId, 250),
    )

    expect(updated.entries[0]?.quantity.grams).toBe(250)
    expect(updated.entries[0]?.macros.proteinG).toBe(50)
  })

  it('refuse une quantité invalide', async () => {
    const meal = await addFood()

    const result = await new ChangeMealEntryQuantityUseCase(meals).execute(
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
      await new RemoveMealEntryUseCase(meals).execute(meal.id, meal.entries[0]!.id),
    )

    expect(updated.isEmpty).toBe(true)
    expect(unwrap(await meals.findById(meal.id))?.isEmpty).toBe(true)
  })

  it('signale une ligne introuvable', async () => {
    const meal = await addFood()

    const result = await new RemoveMealEntryUseCase(meals).execute(
      meal.id,
      idFrom('inconnue'),
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('supprime un repas entier', async () => {
    const meal = await addFood()

    unwrap(await new DeleteMealUseCase(meals).execute(meal.id))

    expect(unwrap(await meals.findById(meal.id))).toBeNull()
  })
})

describe('GetDailyJournalUseCase', () => {
  it('agrège les repas de la journée en read models', async () => {
    const add = new AddFoodToMealUseCase(foods, meals)
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
    const add = new AddFoodToMealUseCase(foods, meals)
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
      await new AddFoodToMealUseCase(foods, meals).execute({
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
    await new AddFoodToMealUseCase(foods, meals).execute({
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
      await new AddFoodToMealUseCase(foods, meals).execute({
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

    const result = await new ChangeMealEntryQuantityUseCase(meals).execute(
      meal.id,
      meal.entries[0]!.id,
      250,
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('refuse d’en retirer une ligne', async () => {
    const meal = await eatenMeal()

    const result = await new RemoveMealEntryUseCase(meals).execute(
      meal.id,
      meal.entries[0]!.id,
    )

    expect(isErr(result)).toBe(true)
  })

  it('refuse d’y ajouter un aliment', async () => {
    const meal = await eatenMeal()

    const result = await new AddFoodToMealUseCase(foods, meals).execute({
      playerId,
      foodItemId: rice.id,
      grams: 200,
      mealType: MealType.LUNCH,
      mealId: meal.id,
    })

    expect(isErr(result)).toBe(true)
  })

  it('laisse tout corriger une fois « pris » annulé', async () => {
    const meal = await eatenMeal()
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, false))

    const updated = unwrap(
      await new ChangeMealEntryQuantityUseCase(meals).execute(
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
  const add = (): AddFoodToMealUseCase => new AddFoodToMealUseCase(foods, meals)
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
      await new AddFoodToMealUseCase(foods, meals).execute({
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

})

describe('ExportInventoryUseCase', () => {
  const useCase = (): ExportInventoryUseCase => new ExportInventoryUseCase(meals, foods)

  const addFoodAt = async (loggedAt: Date, grams = 100): Promise<Meal> =>
    unwrap(
      await new AddFoodToMealUseCase(foods, meals).execute({
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

// --- Planification -----------------------------------------------------------

const dayOf = (text: string): DayKey => {
  const parsed = parseDayKey(text)
  if (parsed === null) throw new Error(`jour de test invalide : ${text}`)
  return parsed
}

const planMeal = async (
  plannedFor: DayKey,
  type: MealType = MealType.DINNER,
  player: PlayerId = playerId,
): Promise<Meal> =>
  unwrap(
    await new AddFoodToMealUseCase(foods, meals).execute({
      playerId: player,
      foodItemId: chicken.id,
      grams: 100,
      mealType: type,
      plannedFor,
    }),
  )

describe('planification d’un repas', () => {
  it('crée le repas au jour prévu, pas au jour de sa composition', async () => {
    const meal = await planMeal(dayOf('2026-09-24'))

    expect(meal.plannedFor).toBe('2026-09-24')
    expect(unwrap(await meals.findByPlayerAndDay(playerId, new Date(2026, 8, 24)))).toHaveLength(1)
  })

  it('crée le repas aujourd’hui quand aucun jour n’est donné', async () => {
    const meal = unwrap(
      await new AddFoodToMealUseCase(foods, meals).execute({
        playerId,
        foodItemId: chicken.id,
        grams: 100,
        mealType: MealType.LUNCH,
      }),
    )

    expect(meal.plannedFor).toBe(dayKeyOf(new Date()))
  })

  it('garde le jour d’un repas existant qu’on complète', async () => {
    const meal = await planMeal(dayOf('2026-09-24'))

    const completed = unwrap(
      await new AddFoodToMealUseCase(foods, meals).execute({
        playerId,
        foodItemId: rice.id,
        grams: 150,
        mealType: MealType.DINNER,
        mealId: meal.id,
        plannedFor: dayOf('2026-09-30'),
      }),
    )

    // `plannedFor` ne vaut que pour un nouveau repas : compléter n'est pas déplacer.
    expect(completed.plannedFor).toBe('2026-09-24')
  })
})

describe('RescheduleMealUseCase', () => {
  const reschedule = (): RescheduleMealUseCase => new RescheduleMealUseCase(meals)

  it('déplace le repas et change son type en un seul geste', async () => {
    const meal = await planMeal(dayOf('2026-09-22'), MealType.DINNER)

    const moved = unwrap(
      await reschedule().execute(meal.id, {
        plannedFor: dayOf('2026-09-23'),
        type: MealType.LUNCH,
      }),
    )

    expect(moved.plannedFor).toBe('2026-09-23')
    expect(moved.type).toBe(MealType.LUNCH)
    const stored = unwrap(await meals.findById(meal.id))
    expect(stored?.plannedFor).toBe('2026-09-23')
    expect(stored?.type).toBe(MealType.LUNCH)
  })

  it('n’écrit rien quand rien ne change', async () => {
    const meal = await planMeal(dayOf('2026-09-22'))
    const save = vi.spyOn(meals, 'save')

    await reschedule().execute(meal.id, { plannedFor: meal.plannedFor, type: meal.type })

    expect(save).not.toHaveBeenCalled()
  })

  it('refuse de déplacer un repas déjà pris', async () => {
    const meal = await planMeal(dayKeyOf(new Date()))
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))

    const result = await reschedule().execute(meal.id, {
      plannedFor: addDays(meal.plannedFor, 1),
      type: meal.type,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEAL')
  })

  it('laisse corriger le type d’un repas déjà pris', async () => {
    // Le type ne déplace aucun apport d'une journée à l'autre.
    const meal = await planMeal(dayKeyOf(new Date()), MealType.DINNER)
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))

    const result = await reschedule().execute(meal.id, {
      plannedFor: meal.plannedFor,
      type: MealType.SNACK,
    })

    expect(isOk(result) && result.value.type).toBe(MealType.SNACK)
  })

  it('signale un repas introuvable', async () => {
    const result = await reschedule().execute(idFrom('inconnu'), {
      plannedFor: dayOf('2026-09-22'),
      type: MealType.LUNCH,
    })

    expect(isErr(result) && result.error.code).toBe('MEAL_NOT_FOUND')
  })
})

describe('MarkMealConsumedUseCase et jours à venir', () => {
  it('refuse de déclarer pris un repas prévu demain', async () => {
    const meal = await planMeal(addDays(dayKeyOf(new Date()), 1))

    const result = await new MarkMealConsumedUseCase(meals).execute(meal.id, true)

    expect(isErr(result)).toBe(true)
    expect(unwrap(await meals.findById(meal.id))?.isConsumed).toBe(false)
  })

  it('accepte après coup le repas d’hier', async () => {
    const meal = await planMeal(addDays(dayKeyOf(new Date()), -1))

    const result = await new MarkMealConsumedUseCase(meals).execute(meal.id, true)

    expect(isOk(result)).toBe(true)
  })

  it('retient le moment du repas quand il est donné', async () => {
    const meal = await planMeal(dayOf('2026-09-20'))
    const at = new Date(2026, 8, 20, 20, 0)

    const eaten = unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true, at))

    expect(eaten.consumedAt).toEqual(at)
  })
})

describe('GetMealUseCase', () => {
  it('retourne le read model du repas', async () => {
    const meal = await planMeal(dayOf('2026-09-24'))

    const summary = unwrap(await new GetMealUseCase(meals).execute(meal.id))

    expect(summary.mealId).toBe(meal.id)
    expect(summary.plannedFor).toBe('2026-09-24')
    expect(summary.entries.map((entry) => entry.foodName)).toEqual(['Blanc de poulet'])
  })

  it('signale un repas introuvable', async () => {
    const result = await new GetMealUseCase(meals).execute(idFrom('inconnu'))

    expect(isErr(result) && result.error.code).toBe('MEAL_NOT_FOUND')
  })
})

describe('GetWeekPlanUseCase', () => {
  const week = (): GetWeekPlanUseCase => new GetWeekPlanUseCase(meals)

  it('retourne les sept jours du lundi au dimanche, même vides', async () => {
    const plan = unwrap(await week().execute(playerId, dayOf('2026-09-23')))

    expect(plan.days.map((day) => day.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
    expect(plan.days.every((day) => day.meals.length === 0 && day.plannedCalories === 0)).toBe(
      true,
    )
  })

  it('range chaque repas à son jour prévu', async () => {
    await planMeal(dayOf('2026-09-22'), MealType.LUNCH)
    await planMeal(dayOf('2026-09-24'), MealType.DINNER)
    await planMeal(dayOf('2026-09-28'), MealType.DINNER)
    await planMeal(dayOf('2026-09-24'), MealType.DINNER, idFrom('autre-joueur'))

    const plan = unwrap(await week().execute(playerId, dayOf('2026-09-23')))

    const counts = Object.fromEntries(plan.days.map((day) => [day.day, day.meals.length]))
    expect(counts).toMatchObject({ '2026-09-22': 1, '2026-09-24': 1, '2026-09-27': 0 })
    expect(plan.days.reduce((sum, day) => sum + day.meals.length, 0)).toBe(2)
  })

  it('compte les calories de tous les repas du jour, pris ou non', async () => {
    // Planifier, c'est regarder ce qu'une journée représentera : n'y compter que
    // les repas pris afficherait zéro sur tous les jours à venir.
    const meal = await planMeal(dayOf('2026-09-24'))

    const plan = unwrap(await week().execute(playerId, dayOf('2026-09-24')))

    const thursday = plan.days.find((day) => day.day === '2026-09-24')
    expect(thursday?.plannedCalories).toBeCloseTo(meal.calculateTotals().calories, 6)
  })

  it('remonte une erreur d’application quand la semaine est illisible', async () => {
    vi.spyOn(meals, 'findByPlayerBetween').mockResolvedValueOnce({
      ok: false,
      error: new RepositoryError('STORAGE_FAILURE', 'disque plein'),
    })

    const result = await week().execute(playerId, dayOf('2026-09-23'))

    expect(isErr(result) && result.error.code).toBe('WEEK_UNREADABLE')
  })
})

describe('RefreshPlannedMealsUseCase', () => {
  const refresh = (): RefreshPlannedMealsUseCase => new RefreshPlannedMealsUseCase(meals, foods)
  const correctChicken = async (): Promise<void> => {
    unwrap(await foods.save(chicken.withMacros(Macros.reconstitute({ proteinG: 31, carbsG: 0, fatG: 3 }))))
  }
  const proteinOf = async (meal: Meal): Promise<number | undefined> =>
    unwrap(await meals.findById(meal.id))?.calculateTotals().macros.proteinG

  it('recalcule un repas prévu dont la fiche a été corrigée', async () => {
    const meal = await planMeal(dayOf('2026-09-24'))
    await correctChicken()

    const rewritten = unwrap(await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27')))

    expect(rewritten).toBe(1)
    expect(await proteinOf(meal)).toBeCloseTo(31, 10)
  })

  it('laisse intact un repas pris', async () => {
    const meal = await planMeal(dayOf('2026-09-22'))
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))
    await correctChicken()

    const rewritten = unwrap(await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27')))

    expect(rewritten).toBe(0)
    expect(await proteinOf(meal)).toBe(20)
  })

  it('n’écrit rien quand aucune fiche n’a changé', async () => {
    await planMeal(dayOf('2026-09-24'))
    const save = vi.spyOn(meals, 'save')

    const rewritten = unwrap(await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27')))

    expect(rewritten).toBe(0)
    expect(save).not.toHaveBeenCalled()
  })

  it('ne touche qu’aux repas du joueur et de la période', async () => {
    const outside = await planMeal(dayOf('2026-09-29'))
    const someoneElse = await planMeal(dayOf('2026-09-24'), MealType.DINNER, idFrom('autre-joueur'))
    await correctChicken()

    unwrap(await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27')))

    expect(await proteinOf(outside)).toBe(20)
    expect(await proteinOf(someoneElse)).toBe(20)
  })

  it('remonte une erreur quand les repas sont illisibles', async () => {
    vi.spyOn(meals, 'findByPlayerBetween').mockResolvedValueOnce(
      err(new RepositoryError('STORAGE_FAILURE', 'disque plein')),
    )

    const result = await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27'))

    expect(isErr(result) && result.error.code).toBe('MEALS_UNREADABLE')
  })

  it('remonte une erreur quand le catalogue est illisible', async () => {
    await planMeal(dayOf('2026-09-24'))
    vi.spyOn(foods, 'findById').mockResolvedValueOnce(
      err(new RepositoryError('STORAGE_FAILURE', 'disque plein')),
    )

    const result = await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27'))

    expect(isErr(result) && result.error.code).toBe('CATALOG_UNREADABLE')
  })

  it('remonte une erreur quand un repas rafraîchi ne s’enregistre pas', async () => {
    await planMeal(dayOf('2026-09-24'))
    await correctChicken()
    vi.spyOn(meals, 'save').mockResolvedValueOnce(
      err(new RepositoryError('STORAGE_FAILURE', 'disque plein')),
    )

    const result = await refresh().execute(playerId, dayOf('2026-09-21'), dayOf('2026-09-27'))

    expect(isErr(result) && result.error.code).toBe('MEAL_NOT_SAVED')
  })
})

describe('GetConsumptionHistoryUseCase', () => {
  const history = (): GetConsumptionHistoryUseCase => new GetConsumptionHistoryUseCase(meals)
  const eat = async (meal: Meal): Promise<void> => {
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))
  }

  it('agrège les repas pris, jour par jour et dans l’ordre', async () => {
    await eat(await planMeal(dayOf('2026-09-21'), MealType.LUNCH))
    await eat(await planMeal(dayOf('2026-09-21'), MealType.DINNER))
    await eat(await planMeal(dayOf('2026-09-19')))

    const days = unwrap(await history().execute(playerId, dayOf('2026-09-16'), dayOf('2026-09-22')))

    expect(days.map((day) => day.day)).toEqual(['2026-09-19', '2026-09-21'])
    expect(days[1]).toMatchObject({
      consumedMealCount: 2,
      calories: 340,
      macros: { proteinG: 40, carbsG: 0, fatG: 20 },
      detail: { saturatedFatG: 6, saltG: 0.4 },
    })
  })

  it('omet les jours dont aucun repas n’a été pris', async () => {
    // Un jour absent n'est pas un jour à zéro calorie : c'est un jour dont on
    // ne sait rien.
    await planMeal(dayOf('2026-09-20'))
    const eaten = await planMeal(dayOf('2026-09-21'), MealType.LUNCH)
    await planMeal(dayOf('2026-09-21'), MealType.DINNER)
    await eat(eaten)

    const days = unwrap(await history().execute(playerId, dayOf('2026-09-16'), dayOf('2026-09-22')))

    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ day: '2026-09-21', consumedMealCount: 1, calories: 170 })
  })

  it('remonte une erreur d’application quand l’historique est illisible', async () => {
    vi.spyOn(meals, 'findByPlayerBetween').mockResolvedValueOnce({
      ok: false,
      error: new RepositoryError('STORAGE_FAILURE', 'disque plein'),
    })

    const result = await history().execute(playerId, dayOf('2026-09-16'), dayOf('2026-09-22'))

    expect(isErr(result) && result.error.code).toBe('HISTORY_UNREADABLE')
  })
})

describe('ExportInventoryUseCase — aliments du foyer', () => {
  it('n’exporte que les aliments dont le profil est l’auteur', async () => {
    const create = (name: string, ownerId: PlayerId | null) =>
      new CreateCustomFoodUseCase(foods).execute({ name, proteinG: 1, carbsG: 1, fatG: 1, ownerId })
    await create('Le mien', playerId)
    await create('Sans auteur', null)
    await create('Celui d’Alex', idFrom('player-alex'))

    const archive = unwrap(await new ExportInventoryUseCase(meals, foods).execute(playerId))

    expect(archive.customFoods.map((food) => food.name).sort()).toEqual(['Le mien', 'Sans auteur'])
  })
})

describe('CreateCustomFoodUseCase — auteur', () => {
  it('rattache l’aliment au profil qui le crée', async () => {
    const food = unwrap(
      await new CreateCustomFoodUseCase(foods).execute({
        name: 'Houmous',
        proteinG: 8,
        carbsG: 14,
        fatG: 17,
        ownerId: playerId,
      }),
    )
    expect(food.ownerId).toBe(playerId)
  })
})

describe('PlanMealForMembersUseCase', () => {
  const alex: PlayerId = idFrom('player-alex')
  const sacha: PlayerId = idFrom('player-sacha')

  async function lunch(): Promise<Meal> {
    return unwrap(
      await new AddFoodToMealUseCase(foods, meals).execute({
        playerId,
        foodItemId: rice.id,
        grams: 200,
        mealType: MealType.LUNCH,
      }),
    )
  }

  it('envoie à chaque membre sa copie, aux portions de ses besoins', async () => {
    const offer = vi.fn(async () => ok(undefined))
    const meal = await lunch()

    const copies = unwrap(
      await new PlanMealForMembersUseCase(meals, { offer }).execute({
        mealId: meal.id,
        plannedBy: playerId,
        ownCalories: 2000,
        guests: [
          { playerId: alex, targetCalories: 2500 },
          { playerId: sacha, targetCalories: null },
        ],
      }),
    )

    expect(copies.map((copy) => [copy.playerId, copy.entries[0]?.quantity.grams])).toEqual([
      [alex, 250],
      [sacha, 200],
    ])
    expect(offer).toHaveBeenCalledTimes(2)
    expect(copies.every((copy) => copy.plannedBy === playerId && !copy.isConsumed)).toBe(true)
  })

  it('ne garde aucune copie sur l’appareil', async () => {
    const meal = await lunch()

    await new PlanMealForMembersUseCase(meals, { offer: async () => ok(undefined) }).execute({
      mealId: meal.id,
      plannedBy: playerId,
      ownCalories: 2000,
      guests: [{ playerId: alex, targetCalories: 2000 }],
    })

    expect(unwrap(await meals.findAllByPlayer(alex))).toEqual([])
  })

  it('n’envoie rien si une copie est impossible', async () => {
    const offer = vi.fn(async () => ok(undefined))
    const meal = await lunch()

    const result = await new PlanMealForMembersUseCase(meals, { offer }).execute({
      mealId: meal.id,
      plannedBy: playerId,
      ownCalories: 2000,
      guests: [{ playerId: alex, targetCalories: 2000 }, { playerId, targetCalories: 2000 }],
    })

    expect(isErr(result)).toBe(true)
    expect(offer).not.toHaveBeenCalled()
  })

  it('dit pourquoi l’envoi a échoué', async () => {
    const meal = await lunch()
    const result = await new PlanMealForMembersUseCase(meals, {
      offer: async () => err(new RepositoryError('NOT_SYNCED', 'pas de compte')),
    }).execute({
      mealId: meal.id,
      plannedBy: playerId,
      ownCalories: null,
      guests: [{ playerId: alex, targetCalories: null }],
    })

    expect(isErr(result) && result.error.code).toBe('NOT_SYNCED')
  })

  it('refuse un repas introuvable', async () => {
    const result = await new PlanMealForMembersUseCase(meals, { offer: async () => ok(undefined) }).execute({
      mealId: idFrom('inconnu'),
      plannedBy: playerId,
      ownCalories: null,
      guests: [{ playerId: alex, targetCalories: null }],
    })
    expect(isErr(result) && result.error.code).toBe('MEAL_NOT_FOUND')
  })
})

describe('GetRecentPortionsUseCase', () => {
  const today = dayKeyOf(new Date())

  it('retient la portion la plus récemment composée de chaque aliment', async () => {
    const adder = new AddFoodToMealUseCase(foods, meals)
    await foods.save(bread)
    const at = (hours: number) => new Date(Date.UTC(2026, 0, 1, hours))
    const input = { playerId, mealType: MealType.LUNCH, plannedFor: today }
    unwrap(await adder.execute({ ...input, foodItemId: bread.id, grams: 25, measure: 'tranche', loggedAt: at(8) }))
    unwrap(await adder.execute({ ...input, foodItemId: bread.id, grams: 75, measure: 'tranche', loggedAt: at(12) }))
    unwrap(await adder.execute({ ...input, foodItemId: rice.id, grams: 180, loggedAt: at(10) }))

    const portions = unwrap(await new GetRecentPortionsUseCase(meals).execute(playerId, today))

    expect(portions.get(bread.id)).toEqual({ grams: 75, measure: 'tranche' })
    expect(portions.get(rice.id)).toEqual({ grams: 180, measure: 'g' })
    expect(portions.has(chicken.id)).toBe(false)
  })

  it('ignore les repas d’un autre joueur et ceux trop anciens', async () => {
    const adder = new AddFoodToMealUseCase(foods, meals)
    const input = { mealType: MealType.LUNCH, foodItemId: rice.id, grams: 100 }
    unwrap(await adder.execute({ ...input, playerId: idFrom('someone-else'), plannedFor: today }))
    unwrap(await adder.execute({ ...input, playerId, plannedFor: addDays(today, -200) }))

    const portions = unwrap(await new GetRecentPortionsUseCase(meals).execute(playerId, today))

    expect(portions.size).toBe(0)
  })
})

describe('RescalePlannedMealsUseCase', () => {
  const rescale = (): RescalePlannedMealsUseCase => new RescalePlannedMealsUseCase(meals)
  const gramsOf = async (meal: Meal): Promise<number | undefined> =>
    unwrap(await meals.findById(meal.id))?.entries[0]?.quantity.grams

  it('ajuste les repas prévus à partir du jour donné', async () => {
    const today = await planMeal(dayOf('2026-09-27'))
    const later = await planMeal(dayOf('2026-10-15'))

    const rewritten = unwrap(await rescale().execute(playerId, dayOf('2026-09-27'), 0.9))

    expect(rewritten).toBe(2)
    expect(await gramsOf(today)).toBe(90)
    expect(await gramsOf(later)).toBe(90)
  })

  it('laisse intacts les repas pris et les jours passés', async () => {
    const yesterday = await planMeal(dayOf('2026-09-26'))
    const eaten = await planMeal(dayOf('2026-09-27'), MealType.LUNCH)
    unwrap(await new MarkMealConsumedUseCase(meals).execute(eaten.id, true))

    const rewritten = unwrap(await rescale().execute(playerId, dayOf('2026-09-27'), 1.2))

    expect(rewritten).toBe(0)
    expect(await gramsOf(yesterday)).toBe(100)
    expect(await gramsOf(eaten)).toBe(100)
  })

  it('ne lit rien quand le facteur vaut 1', async () => {
    const read = vi.spyOn(meals, 'findByPlayerBetween')

    expect(unwrap(await rescale().execute(playerId, dayOf('2026-09-27'), 1))).toBe(0)
    expect(read).not.toHaveBeenCalled()
  })

  it('signale un dépôt illisible', async () => {
    const broken = {
      findByPlayerBetween: async () => err(new RepositoryError('STORAGE_FAILURE', 'lecture impossible')),
    } as unknown as InMemoryMealRepository

    const result = await new RescalePlannedMealsUseCase(broken).execute(
      playerId,
      dayOf('2026-09-27'),
      1.1,
    )

    expect(isErr(result) && result.error.code).toBe('MEALS_UNREADABLE')
  })
})

describe('SaveMealDraftUseCase', () => {
  const save = (): SaveMealDraftUseCase => new SaveMealDraftUseCase(foods, meals)
  const lunch = { plannedFor: dayOf('2026-09-30'), type: MealType.LUNCH }

  it('crée le repas d’un brouillon, avec tous ses aliments, en une écriture', async () => {
    const write = vi.spyOn(meals, 'save')

    const meal = unwrap(
      await save().execute({
        playerId,
        schedule: lunch,
        lines: [
          { foodItemId: chicken.id, grams: 120 },
          { foodItemId: rice.id, grams: 180 },
        ],
      }),
    )

    expect(write).toHaveBeenCalledTimes(1)
    expect(meal.type).toBe(MealType.LUNCH)
    expect(meal.plannedFor).toBe('2026-09-30')
    expect(meal.entries.map((entry) => [entry.foodName, entry.quantity.grams])).toEqual([
      ['Blanc de poulet', 120],
      ['Riz cuit', 180],
    ])
  })

  it('applique ajouts, quantités, retraits et changement de jour ensemble', async () => {
    const meal = await planMeal(dayOf('2026-09-22'))
    const chickenLine = meal.entries[0]!

    const saved = unwrap(
      await save().execute({
        playerId,
        mealId: meal.id,
        schedule: { plannedFor: dayOf('2026-09-23'), type: MealType.LUNCH },
        lines: [{ foodItemId: rice.id, grams: 150 }],
      }),
    )

    expect(saved.plannedFor).toBe('2026-09-23')
    expect(saved.type).toBe(MealType.LUNCH)
    expect(saved.entries.map((entry) => entry.foodName)).toEqual(['Riz cuit'])
    expect(saved.entries.some((entry) => entry.id === chickenLine.id)).toBe(false)

    const changed = unwrap(
      await save().execute({
        playerId,
        mealId: meal.id,
        schedule: { plannedFor: dayOf('2026-09-23'), type: MealType.LUNCH },
        lines: [{ entryId: saved.entries[0]!.id, foodItemId: rice.id, grams: 200 }],
      }),
    )
    expect(changed.entries[0]!.quantity.grams).toBe(200)
  })

  it('n’écrit rien quand le brouillon ne change rien', async () => {
    const meal = await planMeal(dayOf('2026-09-22'))
    const write = vi.spyOn(meals, 'save')

    unwrap(
      await save().execute({
        playerId,
        mealId: meal.id,
        schedule: { plannedFor: meal.plannedFor, type: meal.type },
        lines: meal.entries.map((entry) => ({
          entryId: entry.id,
          foodItemId: entry.foodItemId,
          grams: entry.quantity.grams,
        })),
      }),
    )

    expect(write).not.toHaveBeenCalled()
  })

  it('refuse un repas vide', async () => {
    const result = await save().execute({ playerId, schedule: lunch, lines: [] })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('EMPTY_MEAL')
  })

  it('laisse le repas intact si un aliment a disparu', async () => {
    const meal = await planMeal(dayOf('2026-09-22'))
    const before = unwrap(await meals.findById(meal.id))

    const result = await save().execute({
      playerId,
      mealId: meal.id,
      schedule: { plannedFor: meal.plannedFor, type: meal.type },
      lines: [{ foodItemId: idFrom('ciqual:disparu'), grams: 50 }],
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('FOOD_NOT_FOUND')
    const after = unwrap(await meals.findById(meal.id))
    expect(after?.entries.map((entry) => entry.id)).toEqual(before?.entries.map((entry) => entry.id))
  })

  it('refuse de déplacer un repas déjà pris, sans rien écrire', async () => {
    const meal = await planMeal(dayKeyOf(new Date()))
    unwrap(await new MarkMealConsumedUseCase(meals).execute(meal.id, true))
    const write = vi.spyOn(meals, 'save')

    const result = await save().execute({
      playerId,
      mealId: meal.id,
      schedule: { plannedFor: addDays(meal.plannedFor, 1), type: meal.type },
      lines: meal.entries.map((entry) => ({ entryId: entry.id, foodItemId: entry.foodItemId, grams: 100 })),
    })

    expect(isErr(result)).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })
})
