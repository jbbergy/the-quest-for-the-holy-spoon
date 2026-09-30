import type { Messages } from '../schema'
import type { dashboard as fr } from '../fr/dashboard'

export const dashboard: Messages<typeof fr> = {
  eyebrow: 'Today, {day}',
  hello: 'Hello, {name}',
  helloAnonymous: 'Hello',
  mealsTitle: 'Today’s meals',
  plannedNotice:
    '{n} planned meal, not eaten yet. Tick “Eaten” when you eat it. | {n} planned meals, not eaten yet. Tick “Eaten” when you eat them.',
  emptyTitle: 'No meal planned today.',
  emptyDescription: 'Add the meal you are going to eat, or plan the ones for the week.',
  edit: ' — edit',
  addMeal: 'Add a meal',
  viewWeek: 'See the week',
  adviceTitle: 'Tip of the day',
  overview: {
    needForDay: 'Your target for the day: {kcal}.',
    onlyEaten: 'Only meals marked as eaten count.',
    limitsTitle: 'Not to exceed',
    limitsSubtitle: 'It is better to stay under these limits.',
    recentTitle: 'The last {n} days',
    noRecent:
      'No day to compare yet. Tick “Eaten” on your meals: the average will appear here from tomorrow.',
    averagePerDay:
      'Average per day, over {n} day with meals eaten. | Average per day, over {n} days with meals eaten.',
    dayByDay: 'See day by day',
    noMealEaten: 'No meal eaten: this day does not count in the average.',
    overLimits: '{list}: over the limit',
    gap: {
      aboveLimit: '{amount} over the limit',
      underLimit: 'under the limit',
      floorReached: 'minimum reached',
      belowFloor: '{amount} below the minimum',
      atTarget: 'on target',
      belowTarget: '{amount} below the target',
      aboveTarget: '{amount} above the target',
    },
  },
}
