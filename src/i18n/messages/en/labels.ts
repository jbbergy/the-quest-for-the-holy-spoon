import type { Messages } from '../schema'
import type { labels as fr } from '../fr/labels'

export const labels: Messages<typeof fr> = {
  portion: {
    approximate: 'about {weight}',
  },
  nutrient: {
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbohydrates',
    fat: 'Fat',
    fiber: 'Fibre',
    sugars: 'Sugars',
    saturatedFat: 'Saturated fat',
    salt: 'Salt',
  },
  term: {
    barcode: 'barcode',
    publicCatalogue: 'public catalogue',
    brandProducts: 'brand products',
    need: 'target',
    restingEnergy: 'resting energy',
    howCalculated: 'how it is calculated',
  },
  meal: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    snack: 'Snack',
    dinner: 'Dinner',
    today: 'Today',
  },
  sex: {
    female: 'Female',
    male: 'Male',
  },
  activity: {
    sedentary: { label: 'Sedentary', hint: 'Little or no exercise' },
    light: { label: 'Lightly active', hint: 'Exercise 1 to 3 times a week' },
    moderate: { label: 'Moderately active', hint: 'Exercise 3 to 5 times a week' },
    active: { label: 'Very active', hint: 'Exercise 6 or 7 times a week' },
    veryActive: {
      label: 'Extremely active',
      hint: 'Physical job, or exercise twice a day',
    },
  },
  diet: {
    vegetarian: { label: 'Vegetarian', hint: 'No meat, no fish, no seafood' },
    pescatarian: {
      label: 'Pescatarian',
      hint: 'Fish and seafood, but no meat',
    },
    vegan: {
      label: 'Vegan',
      hint: 'No animal products: no meat, no fish, no milk, no eggs',
    },
    glutenFree: { label: 'Gluten-free', hint: 'No wheat, barley or rye' },
    lactoseFree: { label: 'Lactose-free', hint: 'No milk or dairy products' },
    porkFree: {
      label: 'No pork',
      hint: 'No pork, ham, bacon or wild boar. For example to eat halal or kosher.',
    },
    beefFree: {
      label: 'No beef',
      hint: 'No beef or veal. For example for many Hindus.',
    },
    shellfishFree: {
      label: 'No seafood',
      hint: 'No prawns, mussels, oysters, squid or snails. For example to eat kosher.',
    },
    alcoholFree: {
      label: 'No alcohol',
      hint: 'No alcoholic drinks, no dishes cooked with wine or beer. For example to eat halal.',
    },
  },
  contains: {
    meat: 'Meat',
    pork: 'Pork',
    beef: 'Beef or veal',
    fish: 'Fish',
    shellfish: 'Seafood (prawns, mussels…)',
    milk: 'Milk',
    egg: 'Eggs',
    gluten: 'Gluten (wheat, barley, rye)',
    nuts: 'Tree nuts',
    alcohol: 'Alcohol',
  },
  suits: {
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    glutenFree: 'Gluten-free',
    lactoseFree: 'Lactose-free',
  },
  tag: {
    meat: 'Contains meat',
    pork: 'Contains pork',
    beef: 'Contains beef or veal',
    fish: 'Contains fish',
    shellfish: 'Contains seafood',
    milk: 'Contains milk',
    egg: 'Contains eggs',
    gluten: 'Contains gluten',
    nuts: 'Contains tree nuts',
    alcohol: 'Contains alcohol',
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    glutenFree: 'Gluten-free',
    lactoseFree: 'Lactose-free',
  },
}
