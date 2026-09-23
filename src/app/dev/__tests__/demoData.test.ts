import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import type { AppContainer } from '@/app/composition'
import { addDays, type DayKey } from '@/core/day'
import { idFrom, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import {
  AddFoodToMealUseCase,
  DeleteMealUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  MarkMealConsumedUseCase,
} from '@/modules/nutrition_inventory/application'
import { FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import {
  InMemoryFoodRepository,
  InMemoryMealRepository,
} from '@/modules/nutrition_inventory/infrastructure/InMemoryRepositories'
import { recentWindow, SummarizeRecentIntakeUseCase } from '@/modules/planning/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'

import { DEMO_SCENARIO, gramsFor, removeDemoData, seedDemoData } from '../demoData'

interface CiqualRow {
  readonly code: string
  readonly name: string
  readonly proteinG: number
  readonly carbsG: number
  readonly fatG: number
  readonly fiberG: number
  readonly sugarsG: number
  readonly saturatedFatG: number
  readonly saltG: number
}

/** Le vrai catalogue livré avec l'application : le scénario doit en tirer ses aliments. */
const catalog: readonly CiqualRow[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/ciqual.json'), 'utf8'),
) as CiqualRow[]

const demoFoods = [
  ...new Map(
    DEMO_SCENARIO.flatMap((day) => day.meals.flatMap((meal) => meal.portions)).map(([food]) => [
      food.code,
      food,
    ]),
  ).values(),
]

const playerId: PlayerId = idFrom('player-demo')
const today = '2026-09-23' as DayKey

const needs: PlayerNutritionalNeeds = {
  playerId,
  targetCalories: 2000,
  // Les repères d'un profil réel à 2 000 kcal : répartition 17/48/35, AG
  // saturés à 12 % de l'énergie.
  targetMacros: { proteinG: 85, carbsG: 240, fatG: 77.8 },
  referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 26.7, saltG: 5 },
  restrictions: [],
  allergens: [],
}

let meals: InMemoryMealRepository
let container: AppContainer

beforeEach(async () => {
  const foods = new InMemoryFoodRepository()
  await foods.saveMany(
    catalog
      .filter((row) => demoFoods.some((food) => food.code === row.code))
      .map((row) =>
        FoodItem.reconstitute({
          id: idFrom(`ciqual:${row.code}`),
          name: row.name,
          macrosPer100g: Macros.reconstitute(row),
          detailPer100g: NutrientDetail.reconstitute(row),
          source: FoodSource.CIQUAL,
        }),
      ),
  )
  meals = new InMemoryMealRepository()
  container = {
    inventory: {
      addFood: new AddFoodToMealUseCase(foods, meals),
      markConsumed: new MarkMealConsumedUseCase(meals),
      deleteMeal: new DeleteMealUseCase(meals),
    },
  } as unknown as AppContainer
})

const seed = () => seedDemoData({ container, playerId, dailyCalories: 2000, today })

describe('données de démonstration', () => {
  it('ne tire que des aliments du catalogue, aux calories annoncées', () => {
    for (const food of demoFoods) {
      const row = catalog.find((candidate) => candidate.code === food.code)
      expect(row, `aliment ${food.code} absent du catalogue`).toBeDefined()
      const kcal = Macros.reconstitute(row!).calories()
      expect(Math.abs(kcal - food.kcalPer100g), row!.name).toBeLessThan(1)
    }
  })

  it('compose des journées équilibrées qui totalisent le besoin habituel', () => {
    for (const day of DEMO_SCENARIO) {
      const shares = day.meals
        .flatMap((meal) => meal.portions)
        .reduce((sum, [, share]) => sum + share, 0)
      if (day.meals.length === 4) expect(shares).toBeCloseTo(1, 10)
    }
  })

  it('pèse aux 5 g, et au gramme les aliments denses', () => {
    expect(gramsFor({ code: 'x', kcalPer100g: 100 }, 0.1, 2000)).toBe(200)
    expect(gramsFor({ code: 'x', kcalPer100g: 100 }, 0.0001, 2000)).toBe(5)
    expect(gramsFor({ code: 'x', kcalPer100g: 900 }, 0.07, 2000)).toBe(16)
  })

  it('produit les moyennes annoncées par le scénario', async () => {
    const { created, error } = await seed()
    expect(error).toBeNull()
    expect(created.length).toBeGreaterThan(30)

    const { from, to } = recentWindow(today)
    const history = await new GetConsumptionHistoryUseCase(meals).execute(playerId, from, to)
    if (!history.ok) throw history.error
    const recent = new SummarizeRecentIntakeUseCase().execute(needs, history.value, today)
    if (!recent.ok) throw recent.error

    // Six jours renseignés sur sept : le jour aux repas jamais cochés n'entre
    // pas dans la moyenne.
    expect(recent.value.trackedDays).toBe(6)
    const untracked = recent.value.recentDays.find((day) => day.day === addDays(today, -5))
    expect(untracked?.tracked).toBe(false)

    // −15 +5 +0 −10 −15 −5 : 93 % du besoin en moyenne, soit un déficit
    // d'environ 133 kcal, que l'arrondi des portions décale un peu.
    const { calories, fiberG, saltG, sugarsG, saturatedFatG } = recent.value.nutrients
    expect(calories.gap).toBeLessThan(-110)
    expect(calories.gap).toBeGreaterThan(-160)
    expect(saltG.gap).toBeGreaterThan(0)
    expect(fiberG.gap).toBeLessThan(0)
    expect(sugarsG.gap).toBeLessThan(0)
    expect(saturatedFatG.gap).toBeLessThan(0)
  })

  it('laisse aujourd’hui un petit déjeuner pris et le reste prévu', async () => {
    await seed()

    const journal = await new GetDailyJournalUseCase(meals).execute(
      playerId,
      new Date(2026, 8, 23, 12),
    )
    if (!journal.ok) throw journal.error

    expect(journal.value.meals).toHaveLength(4)
    expect(journal.value.consumedMeals.map((meal) => meal.type)).toEqual(['BREAKFAST'])
  })

  it('date la prise au moment du repas, le jour prévu', async () => {
    await seed()

    const found = await meals.findByPlayerBetween(playerId, addDays(today, -7), addDays(today, -7))
    if (!found.ok) throw found.error
    const breakfast = found.value.find((meal) => meal.type === 'BREAKFAST')

    expect(breakfast?.consumedAt).toEqual(new Date(2026, 8, 16, 8, 0))
  })

  it('se retire entièrement', async () => {
    const { created } = await seed()

    const removed = await removeDemoData(container, created)

    expect(removed).toEqual({ ok: true, value: created.length })
    const left = await meals.findByPlayerBetween(playerId, addDays(today, -7), addDays(today, 2))
    expect(left.ok && left.value).toEqual([])
  })

  it('s’arrête à la première erreur en rendant ce qui a été créé', async () => {
    const { created, error } = await seedDemoData({
      container,
      playerId,
      dailyCalories: 2000,
      today,
      scenario: [
        {
          offset: 0,
          scale: 1,
          consumption: 'none',
          purpose: 'aliment inconnu au second repas',
          meals: [
            {
              type: 'LUNCH',
              hour: 12,
              minute: 0,
              portions: [[{ code: '9104', kcalPer100g: 143 }, 0.1]],
            },
            {
              type: 'DINNER',
              hour: 20,
              minute: 0,
              portions: [[{ code: '0', kcalPer100g: 100 }, 0.1]],
            },
          ],
        },
      ],
    })

    expect(created).toHaveLength(1)
    expect(error?.code).toBe('FOOD_NOT_FOUND')
  })
})
