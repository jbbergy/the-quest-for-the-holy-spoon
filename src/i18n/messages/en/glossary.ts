import type { Messages } from '../schema'
import type { glossary as fr } from '../fr/glossary'

export const glossary: Messages<typeof fr> = {
  calories: 'The energy that food gives you. It is counted in kilocalories (kcal).',
  protein:
    'They build and repair muscles. They are found in meat, fish, eggs, pulses and dairy products.',
  carbs:
    'They give you energy. They are starchy foods and sugars: bread, pasta, rice, potatoes, fruit.',
  fat: 'These are fats: oil, butter, cheese, nuts. The body needs some, in small amounts.',
  fiber:
    'It helps digestion. It is found in vegetables, fruit, pulses and wholemeal bread.',
  sugars:
    'Sugars that reach the blood quickly: sugar, sweets, fizzy drinks, cakes. Fruit and milk contain some too.',
  saturatedFat:
    'Fats that mostly come from animals: butter, cheese, cured meats, pastries. Eating too much is bad for the heart.',
  salt: 'There is a lot in bread, cheese, cured meats and ready meals.',
  needs:
    'The energy your body uses in a day. The app works it out from your height, weight, age and activity.',
  basalMetabolism:
    'The energy your body uses at rest: to breathe, stay warm and keep your heart beating.',
  dailyExpenditure: 'The energy used at rest, plus that of your activities during the day.',
  formula:
    'The app uses the Mifflin-St Jeor formula. Nutritionists recognise it. It gives an estimate, not an exact measurement.',
  weekAverage:
    'Your body does not count day by day. So the app also looks at the average of the last 7 days. A day with no meal eaten does not count.',
  ciqual:
    'The public catalogue of foods in France, published by Anses. It gives the values of common foods: apple, rice, chicken…',
  openFoodFacts:
    'A free database filled in by volunteers. It contains the brand products sold in shops.',
  barcode: 'The number written under the bars, on the packaging. It has 8 to 14 digits.',
  household:
    'A group of people who often eat together. Everyone sees the others’ meals and can plan a meal for several people.',
  sync: 'Your changes are sent to your account. You find them on your other devices.',
  biologicalSex:
    'A man’s body and a woman’s body do not use the same energy. The formula takes this into account.',
}
