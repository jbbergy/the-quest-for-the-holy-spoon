import { type DayKey, dateOfDay } from '@/core/day'
import { MealType } from '@/modules/nutrition_inventory/application'

/**
 * Libellés partagés par l'accueil, la semaine et l'éditeur de repas.
 *
 * Ils étaient recopiés dans chaque vue ; un seul endroit garantit qu'un
 * « Collation » ne devienne pas « En-cas » sur un écran et pas sur l'autre.
 */
export const MEAL_OPTIONS = [
  { value: MealType.BREAKFAST, label: 'Petit-déjeuner' },
  { value: MealType.LUNCH, label: 'Déjeuner' },
  { value: MealType.SNACK, label: 'Collation' },
  { value: MealType.DINNER, label: 'Dîner' },
] as const

export function mealLabel(type: MealType): string {
  return MEAL_OPTIONS.find((option) => option.value === type)?.label ?? type
}

/** Ordre de la journée, pour ranger les repas d'un jour comme on les mange. */
export function mealOrder(type: MealType): number {
  return MEAL_OPTIONS.findIndex((option) => option.value === type)
}

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/** « mercredi 23 septembre » */
export function formatDay(day: DayKey): string {
  return longDay.format(dateOfDay(day))
}

/** « 21 – 27 septembre », ou « 28 septembre – 4 octobre » à cheval sur deux mois. */
export function formatWeek(first: DayKey, last: DayKey): string {
  const start = dateOfDay(first)
  const end = dateOfDay(last)
  const head = start.getMonth() === end.getMonth() ? String(start.getDate()) : shortDay.format(start)
  return `${head} – ${shortDay.format(end)}`
}
