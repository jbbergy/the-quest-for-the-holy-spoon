/**
 * Données de démonstration, pour les essais manuels.
 *
 * Dix jours de repas autour d'aujourd'hui, choisis pour que les moyennes de
 * la semaine aient quelque chose à dire : un déficit calorique modéré, du sel
 * au-dessus du repère, des fibres en dessous, des sucres et des gras saturés
 * sous leur plafond malgré deux journées chargées, une journée non renseignée,
 * et des repas prévus pour la suite.
 *
 * Tout passe par les Use Cases, comme une saisie à la main : aucun
 * enregistrement n'est écrit en base directement, si bien que ces données
 * obéissent aux mêmes règles que les vraies — et restent valables le jour où
 * IndexedDB sera remplacé.
 *
 * Les portions sont exprimées en **part du besoin calorique habituel**, puis
 * converties en grammes pour le profil courant. Un déficit de 10 % reste un
 * déficit de 10 %, quel que soit le profil sur lequel on essaie.
 */
import type { AppContainer } from '@/app/composition'
import { addDays, dateOfDay, type DayKey } from '@/core/day'
import { type BaseError, ApplicationError } from '@/core/errors'
import { idFrom, type MealId, type PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'
import { MealType } from '@/modules/nutrition_inventory/application'

interface DemoFood {
  readonly code: string
  /** Calories pour 100 g, par les coefficients d'Atwater, comme l'application les calcule. */
  readonly kcalPer100g: number
}

const FOOD = {
  baguette: { code: '7001', kcalPer100g: 279 },
  oats: { code: '9313', kcalPer100g: 71 },
  banana: { code: '13005', kcalPer100g: 88 },
  ham: { code: '28910', kcalPer100g: 125 },
  rice: { code: '9104', kcalPer100g: 143 },
  greenBeans: { code: '20320', kcalPer100g: 23 },
  oliveOil: { code: '17270', kcalPer100g: 901 },
  greekYogurt: { code: '19860', kcalPer100g: 113 },
  almonds: { code: '15000', kcalPer100g: 575 },
  darkChocolate: { code: '31074', kcalPer100g: 566 },
  comte: { code: '12110', kcalPer100g: 420 },
  salmon: { code: '26038', kcalPer100g: 196 },
  pasta: { code: '9811', kcalPer100g: 121 },
  broccoli: { code: '20304', kcalPer100g: 33 },
  croissant: { code: '7620', kcalPer100g: 413 },
  milk: { code: '19042', kcalPer100g: 46 },
  pizza: { code: '25516', kcalPer100g: 228 },
  cola: { code: '18018', kcalPer100g: 42 },
  candy: { code: '31003', kcalPer100g: 410 },
  crisps: { code: '4004', kcalPer100g: 536 },
  dryCuredSausage: { code: '30300', kcalPer100g: 417 },
} as const satisfies Record<string, DemoFood>

/** Un aliment et sa part du besoin calorique de la journée. */
type Portion = readonly [DemoFood, number]

interface MealTemplate {
  readonly type: MealType
  readonly hour: number
  readonly minute: number
  readonly portions: readonly Portion[]
}

/**
 * Une journée ordinaire : ses parts totalisent exactement le besoin habituel,
 * réparti à peu près comme le recommande le profil (19 % de protéines, 47 % de
 * glucides, 34 % de lipides). Comme l'assiette française moyenne, elle manque
 * un peu de fibres — environ 25 g pour 2 000 kcal — et pain et jambon y portent
 * le sel à près de 5 g : les deux journées chargées font alors passer la
 * semaine au-dessus du repère.
 */
const BALANCED: readonly MealTemplate[] = [
  {
    type: MealType.BREAKFAST,
    hour: 8,
    minute: 0,
    portions: [
      [FOOD.baguette, 0.1],
      [FOOD.oats, 0.04],
      [FOOD.banana, 0.04],
    ],
  },
  {
    type: MealType.LUNCH,
    hour: 12,
    minute: 30,
    portions: [
      [FOOD.ham, 0.08],
      [FOOD.baguette, 0.08],
      [FOOD.rice, 0.1],
      [FOOD.greenBeans, 0.02],
      [FOOD.oliveOil, 0.06],
      [FOOD.greekYogurt, 0.04],
    ],
  },
  {
    type: MealType.SNACK,
    hour: 16,
    minute: 30,
    portions: [
      [FOOD.almonds, 0.05],
      [FOOD.darkChocolate, 0.03],
      [FOOD.comte, 0.04],
    ],
  },
  {
    type: MealType.DINNER,
    hour: 20,
    minute: 0,
    portions: [
      [FOOD.salmon, 0.07],
      [FOOD.pasta, 0.17],
      [FOOD.broccoli, 0.02],
      [FOOD.oliveOil, 0.06],
    ],
  },
]

/**
 * Une journée chargée : des calories raisonnables, mais sucres, sel et gras
 * saturés au-dessus de leurs plafonds, et peu de fibres.
 */
const FEAST: readonly MealTemplate[] = [
  {
    type: MealType.BREAKFAST,
    hour: 9,
    minute: 0,
    portions: [
      [FOOD.croissant, 0.15],
      [FOOD.milk, 0.05],
    ],
  },
  {
    type: MealType.LUNCH,
    hour: 13,
    minute: 0,
    portions: [
      [FOOD.pizza, 0.3],
      [FOOD.cola, 0.08],
    ],
  },
  { type: MealType.SNACK, hour: 17, minute: 0, portions: [[FOOD.candy, 0.08]] },
  {
    type: MealType.DINNER,
    hour: 19,
    minute: 30,
    portions: [
      [FOOD.crisps, 0.12],
      [FOOD.dryCuredSausage, 0.14],
      [FOOD.cola, 0.08],
    ],
  },
]

/** Quels repas de la journée sont cochés « pris ». */
type Consumption = 'all' | 'none' | 'breakfast-only'

export interface DemoDay {
  /** Décalage par rapport à aujourd'hui. */
  readonly offset: number
  /** Multiplicateur appliqué à toute la journée : 0,85 = déficit de 15 %. */
  readonly scale: number
  readonly meals: readonly MealTemplate[]
  readonly consumption: Consumption
  /** Ce que la journée illustre, pour qui relit ce scénario. */
  readonly purpose: string
}

/**
 * Le scénario. Moyennes attendues sur les six jours renseignés : calories à
 * 93 % du besoin (−15 +5 +0 −10 −15 −5, soit un déficit moyen d'environ 7 %),
 * sel au-dessus du repère, fibres en dessous (jusqu'à 2 800 kcal de besoin
 * environ), sucres et AG saturés sous leur plafond malgré les deux journées
 * chargées.
 */
export const DEMO_SCENARIO: readonly DemoDay[] = [
  { offset: -7, scale: 0.85, meals: BALANCED, consumption: 'all', purpose: 'journée ordinaire, 15 % sous le besoin' },
  { offset: -6, scale: 1.05, meals: BALANCED, consumption: 'all', purpose: 'journée ordinaire, 5 % au-dessus' },
  {
    offset: -5,
    scale: 1,
    meals: BALANCED,
    consumption: 'none',
    purpose: 'repas prévus mais jamais cochés : jour non renseigné, hors de la moyenne',
  },
  { offset: -4, scale: 1, meals: FEAST, consumption: 'all', purpose: 'restaurant : sel, sucres et gras saturés au-dessus des plafonds' },
  { offset: -3, scale: 0.9, meals: BALANCED, consumption: 'all', purpose: 'journée ordinaire, 10 % sous le besoin' },
  { offset: -2, scale: 0.85, meals: BALANCED, consumption: 'all', purpose: 'journée ordinaire, 15 % sous le besoin' },
  { offset: -1, scale: 0.95, meals: FEAST, consumption: 'all', purpose: 'apéritif : plafonds dépassés' },
  {
    offset: 0,
    scale: 1,
    meals: BALANCED,
    consumption: 'breakfast-only',
    purpose: 'aujourd’hui : petit déjeuner pris, le reste prévu',
  },
  { offset: 1, scale: 1, meals: BALANCED, consumption: 'none', purpose: 'demain, planifié' },
  {
    offset: 2,
    scale: 1,
    meals: BALANCED.filter((meal) => meal.type === MealType.LUNCH || meal.type === MealType.DINNER),
    consumption: 'none',
    purpose: 'après-demain, en partie planifié',
  },
]

/**
 * Arrondi comme on pèse : aux 5 g, sauf pour les aliments denses — 5 g d'huile
 * font 45 kcal, et six journées d'arrondis fausseraient la moyenne annoncée.
 */
export function gramsFor(food: DemoFood, share: number, dailyCalories: number): number {
  const grams = ((share * dailyCalories) / food.kcalPer100g) * 100
  const step = food.kcalPer100g >= DENSE_KCAL_PER_100G ? 1 : 5
  return Math.max(step, Math.round(grams / step) * step)
}

const DENSE_KCAL_PER_100G = 300

function isConsumed(consumption: Consumption, type: MealType): boolean {
  return consumption === 'all' || (consumption === 'breakfast-only' && type === MealType.BREAKFAST)
}

function atTime(day: DayKey, hour: number, minute: number): Date {
  const date = dateOfDay(day)
  date.setHours(hour, minute, 0, 0)
  return date
}

export interface DemoSeedOptions {
  readonly container: AppContainer
  readonly playerId: PlayerId
  /** Besoin calorique habituel du profil, pour dimensionner les portions. */
  readonly dailyCalories: number
  readonly today: DayKey
  readonly scenario?: readonly DemoDay[]
}

/**
 * Crée les repas du scénario et retourne leurs identifiants, pour pouvoir les
 * retirer ensuite. S'arrête à la première erreur, en retournant aussi ce qui a
 * déjà été créé — c'est ce qu'il faudra nettoyer.
 */
export async function seedDemoData(options: DemoSeedOptions): Promise<{
  readonly created: readonly MealId[]
  readonly error: BaseError | null
}> {
  const { container, playerId, dailyCalories, today } = options
  const created: MealId[] = []

  for (const day of options.scenario ?? DEMO_SCENARIO) {
    const plannedFor = addDays(today, day.offset)

    for (const meal of day.meals) {
      const at = atTime(plannedFor, meal.hour, meal.minute)
      let mealId: MealId | undefined

      for (const [food, share] of meal.portions) {
        const added = await container.inventory.addFood.execute({
          playerId,
          foodItemId: idFrom(`ciqual:${food.code}`),
          grams: gramsFor(food, share * day.scale, dailyCalories),
          mealType: meal.type,
          plannedFor,
          loggedAt: at,
          ...(mealId === undefined ? {} : { mealId }),
        })
        if (!added.ok) return { created, error: added.error }
        if (mealId === undefined) {
          mealId = added.value.id
          created.push(mealId)
        }
      }

      if (mealId !== undefined && isConsumed(day.consumption, meal.type)) {
        const eaten = await container.inventory.markConsumed.execute(mealId, true, at)
        if (!eaten.ok) return { created, error: eaten.error }
      }
    }
  }

  return { created, error: null }
}

/** Supprime les repas donnés ; un repas déjà supprimé à la main n'est pas une erreur. */
export async function removeDemoData(
  container: AppContainer,
  mealIds: readonly MealId[],
): Promise<Result<number, BaseError>> {
  let removed = 0
  for (const mealId of mealIds) {
    const deleted = await container.inventory.deleteMeal.execute(mealId)
    if (!deleted.ok) {
      return err(
        new ApplicationError(
          'DEMO_NOT_REMOVED',
          'Les données de démonstration n’ont pas toutes pu être retirées.',
          {
            cause: deleted.error,
          },
        ),
      )
    }
    removed += 1
  }
  return ok(removed)
}
