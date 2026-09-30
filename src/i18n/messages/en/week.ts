import type { Messages } from '../schema'
import type { week as fr } from '../fr/week'

export const week: Messages<typeof fr> = {
  title: 'Week',
  navLabel: 'Week navigation',
  previous: 'Previous week',
  next: 'Next week',
  shoppingList: 'Shopping list',
  shoppingListOfWeek: 'for this week',
  backToCurrent: 'Back to the current week',
  addMeal: 'Add a meal',
  addMealOn: 'on {day}',
  noMeals: 'No meal planned',
  total: '{kcal} kcal in total',
  todayWithTotal: 'Today · {total}',
  plannedBy: 'Planned for you by {name}',
  aHouseholdMember: 'a household member',
  edit: ' — edit',
  mealOnDay: '{meal} on {day}',
  member: {
    back: '← Household',
    fallbackName: 'Household member',
    pageTitle: '{name}’s day',
    today: 'Today',
    changeDay: 'Change day',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    notShared: '{name} is not showing their days at the moment.',
    loading: 'Loading…',
    gaugesNotReady:
      '{name}’s gauges are not ready yet. They will appear once their app has sent their target.',
    mealsTitle: '{name}’s meals',
    noMealsTitle: 'No meal that day.',
    noMealsDescription: 'Nothing planned, nothing eaten.',
    planned: 'Planned',
    eaten: 'Eaten',
  },
  plan: {
    title: 'Also plan for…',
    subtitle:
      'Each person gets this meal in their week. Portions are adjusted to their target. They can change them.',
    legend: 'Household members',
    submit: 'Plan for this person | Plan for these people',
    planned: 'The meal is planned for {names}. Portions are adjusted to each person’s target.',
    plannedUnknown:
      'The meal is planned for {names}. We do not yet know the target of {unknown}: their portions are the same as yours.',
  },
}
