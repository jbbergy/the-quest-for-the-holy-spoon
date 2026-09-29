import { describe, expect, it } from 'vitest'

import { idFrom } from '@/core/identity'
import { recipesMatching } from '@/modules/nutrition_inventory/application/recipeSearch'
import type { RecipeSummary } from '@/modules/nutrition_inventory/application/readModels'

const recipe = (name: string): RecipeSummary => ({ recipeId: idFrom(name), name, lines: [] })

const recipes = [recipe('Poke bowl'), recipe('Curry de pois chiches'), recipe('Crêpes')]
const names = (found: readonly RecipeSummary[]) => found.map((r) => r.name)

describe('recipesMatching', () => {
  it('trouve par le début d’un mot, sans tenir compte des accents ni de la casse', () => {
    expect(names(recipesMatching(recipes, 'POK'))).toEqual(['Poke bowl'])
    expect(names(recipesMatching(recipes, 'crepe'))).toEqual(['Crêpes'])
  })

  it('exige tous les mots, dans n’importe quel ordre', () => {
    expect(names(recipesMatching(recipes, 'bowl poke'))).toEqual(['Poke bowl'])
    expect(names(recipesMatching(recipes, 'poke curry'))).toEqual([])
  })

  it('ne trouve rien pour une saisie sans mot ou un code-barres', () => {
    expect(recipesMatching(recipes, '')).toEqual([])
    expect(recipesMatching(recipes, 'a')).toEqual([])
    expect(recipesMatching(recipes, '3017620422003')).toEqual([])
  })
})
