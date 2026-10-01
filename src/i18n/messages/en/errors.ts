import type { Messages } from '../schema'
import type { errors as fr } from '../fr/errors'

export const errors: Messages<typeof fr> = {
  INVALID_PORTION: 'The amount must be a number greater than 0.',
  INVALID_MACROS: 'The values must be positive numbers.',
  INVALID_NUTRIENTS: 'The values must be positive numbers.',
  INVALID_MEASUREMENT:
    'A measurement looks wrong. Check your height (in cm), your weight (in kg) and your age.',
  INVALID_PLAYER: 'Write a first name or a nickname, up to 60 letters.',
  INCOMPATIBLE_DIETARY_RESTRICTION:
    'These diets do not go together. For example: vegan and pescatarian. Keep only one.',
  INVALID_FOOD_ITEM: 'This food is not complete. Check its name, its barcode and its portions.',
  INVALID_MEAL: 'This change is not possible on this meal.',
  FOOD_NOT_FOUND: 'This food no longer exists.',
  FOOD_READ_ONLY: 'This food comes from a catalogue. You cannot change it.',
  EMPTY_MEAL: 'Add at least one food to save the meal.',
  MEAL_NOT_FOUND: 'This meal no longer exists.',
  NO_CURRENT_PROFILE: 'There is no profile yet. Create your profile first.',
  STORAGE_QUOTA_EXCEEDED: 'The device is out of space. Free up some space, then try again.',
  STORAGE_UNAVAILABLE:
    'The app cannot save on this device. Check that the browser is not in private browsing.',
  REMOTE_UNAVAILABLE: 'The search for brand products is not responding. Try again later.',
  UNKNOWN_THEME: 'These colours no longer exist. Choose others.',
  INVALID_EMAIL: 'This email address is not correct.',
  WEAK_PASSWORD: 'This password is too short. It needs at least 12 characters.',
  INVALID_CREDENTIALS: 'The email address or the password is wrong.',
  EMAIL_NOT_VERIFIED:
    'Your address is not confirmed yet. We have just sent you a new link: check your email.',
  TOKEN_INVALID: 'This link no longer works. It has already been used, or it is too old. Ask for a new link.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes, then try again.',
  PLAYER_ALREADY_LINKED: 'This profile is already linked to another account.',
  NOT_AUTHENTICATED: 'You are no longer signed in. Sign in again.',
  SERVER_UNREACHABLE: 'The server is not responding. Check your internet connection, then try again.',
  INVALID_HOUSEHOLD_NAME: 'The household name must be 1 to 60 letters long.',
  NOT_HOUSEHOLD_OWNER: 'Only the person in charge of the household can do this.',
  NO_HOUSEHOLD: 'You are no longer part of a household.',
  ALREADY_IN_HOUSEHOLD:
    'You are already part of a household. Leave it first to create or join another one.',
  ALREADY_HOUSEHOLD_MEMBER: 'This person is already part of the household.',
  ALREADY_INVITED: 'This person already has an invitation. They have not answered yet.',
  HOUSEHOLD_FULL: 'The household is full: 12 people at most, invitations included.',
  INVITATION_NOT_FOUND: 'This invitation no longer exists. It is too old, or it was cancelled.',
  MEMBER_NOT_FOUND: 'This person is no longer part of the household.',
  OWNER_CANNOT_LEAVE: 'The person in charge cannot leave the household. They can delete it.',
  DAYS_NOT_SHARED: 'This person is not showing their days at the moment.',
  NOT_SYNCED: 'Sign in to plan a meal for the household.',
  NOT_OWNER: 'Another member of the household created this item. You cannot change it.',
  HOUSEHOLD_CONFLICT:
    'The household changed in the meantime. Here is how it is now. Try again if needed.',
  INVALID_SHOPPING_ITEM: 'Write the name of the item, up to 80 letters.',
  INVALID_RECIPE: 'A recipe has a name of 1 to 60 letters, and at least one food.',
  RECIPE_NAME_TAKEN:
    'You already have a recipe with this name. Choose another name, or delete the old recipe.',
  RECIPE_NOT_FOUND: 'This recipe no longer exists.',
  RECIPE_NOT_SAVED: 'The recipe could not be saved. Try again.',
  RECIPE_FOODS_MISSING:
    'The foods of this recipe are no longer in the catalogue. The meal is unchanged.',
  INVALID_FAVORITE_PORTION: 'This portion cannot be kept. Choose a quantity greater than zero.',
  FAVORITE_PORTIONS_FULL:
    'This food already has 5 favourite portions. Remove one before adding another.',
  FAVORITE_PORTION_NOT_SAVED: 'The favourite portion could not be saved. Try again.',
  SHOPPING_ITEM_NOT_FOUND: 'This item is no longer in the list. Someone may have removed it.',
  UNKNOWN: 'Something went wrong. Try again.',
}
