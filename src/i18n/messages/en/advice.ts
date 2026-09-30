import type { Messages } from '../schema'
import type { advice as fr } from '../fr/advice'

export const advice: Messages<typeof fr> = {
  exceeded: 'You ate {kcal} kcal more than your target.',
  exceededNote: 'That is fine. What matters is the average over several days.',
  complete: 'You ate what you need today.',
  remaining: 'You have {kcal} kcal left for today.',
  missingMacro: 'You are mostly missing {name}: {grams} g.',
  missingFiber: 'You are {also} missing {grams} g of fibre.',
  also: 'also',
  stillMissing: 'still',
  forExample: 'For example: {examples}.',
  macro: {
    protein: 'protein',
    carbs: 'carbohydrates',
    fat: 'fat',
  },
  example: {
    meat: 'meat',
    fish: 'fish',
    eggs: 'eggs',
    pulses: 'pulses',
    tofu: 'tofu',
    yogurt: 'yoghurt',
    bread: 'bread',
    pasta: 'pasta',
    rice: 'rice',
    potatoes: 'potatoes',
    fruit: 'fruit',
    oliveOil: 'olive oil',
    nuts: 'nuts',
    avocado: 'avocado',
    cheese: 'cheese',
    vegetables: 'vegetables',
    wholemealBread: 'wholemeal bread',
  },
}
