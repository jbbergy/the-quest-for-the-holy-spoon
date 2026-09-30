import type { Messages } from '../schema'
import type { shopping as fr } from '../fr/shopping'

export const shopping: Messages<typeof fr> = {
  weekOf: 'Week of {range}',
  title: 'Shopping list',
  scopePersonal: 'This list is yours only.',
  scopeHousehold: 'This list is shared by the household. Every member sees it and can tick items.',
  scopeHouseholdNamed:
    'This list is shared by the household “{name}”. Every member sees it and can tick items.',
  fillTitle: 'Fill from the meals',
  fillSubtitle:
    'The list takes the foods of the week’s meals that are not eaten yet. It adds or changes items, but never removes any: you remove them, with the cross.',
  fill: 'Fill the list',
  added: '{n} item added | {n} items added',
  updated: '{n} item changed | {n} items changed',
  upToDate: 'The list was already up to date.',
  updatedList: 'The list is up to date: {changes}.',
  ownMealsOnly: 'No connection: only your meals are counted.',
  skippedNotShared:
    '{name}’s meals are not counted: {name} does not share their days. {name} can fill the list on their side.',
  skippedOffline: '{name}’s meals are not counted: no connection. Try again later.',
  itemsTitle: 'Items',
  itemCount: '{n} item | {n} items',
  itemCountChecked: '{count}, of which {checked} in the basket',
  emptyTitle: 'The list is empty.',
  emptyDescription: 'Fill it from the week’s meals, or add an item.',
  noLongerInMeals: 'no longer in the meals',
  removeItem: 'Remove {name} from the list',
  addTitle: 'Add an item',
  addSubtitle: 'Search for a food, then choose the amount.',
  notFood: 'It is not a food, or you cannot find it?',
  quantityLabel: 'Amount (optional)',
  quantityHint: 'For example: 200 g, 1 pack, x3.',
  addAsIs: 'Add “{name}” as it is',
  nameAdded: '{name} added.',
  nameAddedQuantity: '{name} added ({quantity}).',
}
