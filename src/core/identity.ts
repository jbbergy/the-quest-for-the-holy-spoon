/**
 * Identifiants typés nominalement (*branded types*).
 *
 * Sans marque, `playerId` et `mealId` sont tous deux des `string` et s'échangent
 * silencieusement. La marque n'existe qu'à la compilation : à l'exécution, ce
 * sont de simples chaînes, directement sérialisables.
 */
declare const brand: unique symbol

export type Id<TBrand extends string> = string & { readonly [brand]: TBrand }

export type PlayerId = Id<'PlayerId'>
export type FoodItemId = Id<'FoodItemId'>
export type MealId = Id<'MealId'>
export type MealEntryId = Id<'MealEntryId'>

/** Génère un identifiant neuf. `crypto` est un standard web comme Node. */
export function newId<TBrand extends string>(): Id<TBrand> {
  return crypto.randomUUID() as Id<TBrand>
}

/**
 * Marque une chaîne existante — réservé à la réhydratation depuis le stockage et
 * aux tests. Aucune validation : la donnée est réputée déjà vérifiée.
 */
export function idFrom<TBrand extends string>(raw: string): Id<TBrand> {
  return raw as Id<TBrand>
}
