import type { Messages } from '../schema'
import type { calculations as fr } from '../fr/calculations'

export const calculations: Messages<typeof fr> = {
  title: 'How are my figures calculated?',
  intro:
    'This page explains where the app’s figures come from. First those of the foods. Then those of your day. The bold numbers are yours.',
  caveat:
    'These figures help you eat a balanced diet. They do not replace the advice of a doctor or a dietitian.',
  yours: {
    title: 'Your targets',
    need: 'Your daily need',
    rest: 'At rest',
    activity: 'With your activity',
    kcal: '{kcal} kcal',
  },
  foods: {
    title: '1. What a food contains',
    subtitle: 'The figures come from public databases.',
    ciqual: 'Common foods (apple, rice, chicken…) come from **Ciqual**, the public catalogue of Anses, the French food safety agency.',
    off: 'Brand products come from **Open Food Facts**, a free database filled in by volunteers.',
    own: 'Foods you create yourself keep the figures you wrote.',
    per100: 'Figures are given **per 100 g**. For a branded liquid, it is per 100 ml.',
  },
  eaten: {
    title: '2. What you eat',
    subtitle: 'The calculation is made for the portion you chose.',
    portions:
      '**Portions.** If you choose “1 slice”, the app converts it into grams. A “≈” sign means the weight of the slice is an average.',
    crossProduct:
      '**Cross-multiplication.** Each figure of the food is multiplied by the portion, then divided by 100.',
    calories:
      '**Calories.** They are calculated from protein, carbohydrates and fat: {protein} kcal per gram of protein, {carbs} kcal per gram of carbohydrates, {fat} kcal per gram of fat.',
    example:
      '**Example.** Per 100 g, a food contains {proteinG} g of protein, {carbsG} g of carbohydrates and {fatG} g of fat. That makes {proteinG} × {protein} + {carbsG} × {carbs} + {fatG} × {fat} = **{per100} kcal** per 100 g. For {grams} g, we multiply by {factor}: **{total} kcal**.',
    others:
      'Fibre, sugars, saturated fat and salt are calculated the same way. They are not added to the calories: they are already included, except salt, which gives none.',
    missing:
      'When a database does not give a value, the app counts 0. For salt, Open Food Facts sometimes gives sodium: the app multiplies it by 2.5.',
    onlyEaten:
      'Only meals **ticked as eaten** count in your gauges. A planned meal does not count yet.',
    frozen:
      'An eaten meal keeps the figures of the day you added it. If the food is corrected later, your past day does not change.',
  },
  need: {
    title: '3. Your calorie target',
    subtitle: 'It is the energy your body uses in a day.',
    resting:
      '**At rest.** The app uses the Mifflin-St Jeor formula: 10 × weight + 6.25 × height − 5 × age, then {sexTerm} for {sexLabel}.',
    restingMine: '10 × {weight} + 6.25 × {height} − 5 × {age} {sexTerm} = **{rest} kcal**',
    sexMale: 'a man',
    sexFemale: 'a woman',
    withActivity:
      '**With your activity.** We multiply by a coefficient: 1.2 if you hardly move, up to 1.9 for a physical job. Yours: “{activity}”.',
    withActivityMine: '{rest} × {multiplier} = **{need} kcal per day**',
    note: 'This number is your target. The app does not ask you to lose or gain weight: it aims for balance. It is an estimate, not an exact measurement.',
  },
  macros: {
    title: '4. Your protein, carbohydrates and fat',
    subtitle: 'Your calorie target is split in three.',
    intro:
      'The split follows the guidelines of Anses. It is the same for everyone. Each share is then turned into grams, with the same kcal per gram as in step 2.',
    line: '{share} of {need} kcal ÷ {kcalPerGram} = **{grams} g**',
  },
  limits: {
    title: '5. Fibre, sugars, saturated fat and salt',
    subtitle: 'Here, there is a minimum or a limit.',
    fiber: 'A **minimum**: at least 30 g per day.',
    sugars: 'A **limit**: no more than 100 g per day.',
    saturatedFat:
      'A **limit**: {share} of {need} kcal ÷ {kcalPerGram} = **{grams} g**. It is the only one that changes from one person to another.',
    salt: 'A **limit**: less than 5 g per day.',
    sugarsNote:
      'For sugars, the app also counts those of milk and fruit. The limit is therefore a little strict: this is intended.',
  },
  average: {
    title: '6. The average of the last 7 days',
    subtitle: 'Your body does not count day by day.',
    days: 'The app takes the {n} days **before today**.',
    ignored:
      'A day where you marked **no meal as eaten** is ignored. It is not a fast: it is a day with nothing recorded.',
    compare:
      'For each other day, it compares what you ate with the target you had that day. Then it takes the average.',
    note: 'This average **does not change** your target for the next day. Eating more one day does not mean eating less the next.',
  },
}
