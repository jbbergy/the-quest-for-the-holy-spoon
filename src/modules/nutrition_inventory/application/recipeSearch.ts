import { tokenize } from '@/core/infrastructure/text'

import type { RecipeSummary } from './readModels'

/**
 * Les recettes que retrouve une recherche : celles dont le nom contient tous
 * les mots tapés, ou leur début — « poke » trouve « Poke bowl », « bowl poke »
 * aussi. Même règle que la recherche d'aliments, accents et casse ignorés.
 *
 * Une saisie sans mot (vide, ou faite de mots trop courts) ne trouve rien : un
 * code-barres n'est pas un nom de recette.
 */
export function recipesMatching(
  recipes: readonly RecipeSummary[],
  query: string,
): readonly RecipeSummary[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []

  return recipes.filter((recipe) => {
    const tokens = tokenize(recipe.name)
    return terms.every((term) => tokens.some((token) => token.startsWith(term)))
  })
}
