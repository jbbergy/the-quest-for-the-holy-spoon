import type { Messages } from '../schema'
import type { recipes as fr } from '../fr/recipes'

export const recipes: Messages<typeof fr> = {
  list: {
    title: 'My recipes',
    count: '{n} recipe. | {n} recipes.',
    meta: '{n} food: {list} | {n} foods: {list}',
    emptyTitle: 'You do not have any recipe yet.',
    emptyDescription:
      'Compose a meal, then choose “Keep as a recipe”. You will find it here, and in the food search.',
    compose: 'Compose a meal',
  },
  detail: {
    notFoundTitle: 'This recipe no longer exists.',
    notFoundDescription: 'It was deleted, on this device or on another one.',
    nameCard: 'Name',
    nameLabel: 'Recipe name',
    rename: 'Change the name',
    foodsCard: 'Foods',
    foodsCount: '{n} food | {n} foods',
    amountOf: 'Amount of {food}, in {unit}',
    remove: 'Remove {food}',
    note: 'To add a food, compose a meal with the recipe, add the food to it, then keep it as a recipe under another name.',
    deleteQuestion: 'Delete the recipe “{name}”? Meals already composed do not change.',
    delete: 'Delete',
    deleteRecipe: 'Delete the recipe',
    nameSaved: 'Name saved.',
    amountSaved: 'Amount of {food} saved.',
    lineRemoved: '{food} removed from the recipe.',
  },
}
