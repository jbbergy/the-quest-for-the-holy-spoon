import { describe, expect, it } from 'vitest'

import {
  portionsFromOpenFoodFacts,
  servingName,
} from '@/modules/nutrition_inventory/infrastructure/openFoodFactsPortions'
import { openFoodFactsResponseSchema } from '@/modules/nutrition_inventory/infrastructure/openFoodFactsSchema'

/** Produit tel que l'API le renvoie, passé par le même schéma que le fournisseur. */
const product = (fields: Record<string, unknown>) => {
  const parsed = openFoodFactsResponseSchema.parse({ status: 1, product: fields })
  if (parsed.product === undefined) throw new Error('produit de test invalide')
  return parsed.product
}

describe('portionsFromOpenFoodFacts', () => {
  // Réponses relevées sur l'API le 2026-09-27.
  it('nomme la portion d’après le texte : pain de mie', () => {
    const portions = portionsFromOpenFoodFacts(
      product({
        quantity: '500 g',
        product_quantity: 500,
        product_quantity_unit: 'g',
        serving_size: '25 g (1 tranche)',
        serving_quantity: 25,
        serving_quantity_unit: 'g',
      }),
    )

    expect(portions.unit).toBe('g')
    expect(portions.servings).toEqual([
      { label: 'tranche', grams: 25, approximate: false },
      { label: 'paquet', grams: 500, approximate: false },
    ])
  })

  it('ne répète pas l’emballage quand il est la portion : skyr', () => {
    const portions = portionsFromOpenFoodFacts(
      product({
        product_quantity: 140,
        product_quantity_unit: 'g',
        serving_size: '1 serving (140 g)',
        serving_quantity: 140,
        serving_quantity_unit: 'g',
      }),
    )

    expect(portions.servings).toEqual([{ label: 'portion', grams: 140, approximate: false }])
  })

  it('mesure une boisson en millilitres : soda', () => {
    const portions = portionsFromOpenFoodFacts(
      product({
        product_quantity: '330',
        product_quantity_unit: 'ml',
        serving_size: '1 portion (330 ml)',
        serving_quantity: 330,
        serving_quantity_unit: 'ml',
      }),
    )

    expect(portions).toEqual({
      unit: 'ml',
      density: 1,
      servings: [{ label: 'portion', grams: 330, approximate: false }],
    })
  })

  it('se contente de l’emballage quand la portion manque : pâte à tartiner', () => {
    const portions = portionsFromOpenFoodFacts(
      product({ quantity: '400 g e', product_quantity: 400, product_quantity_unit: 'g', serving_quantity_unit: 'g' }),
    )

    expect(portions.servings).toEqual([{ label: 'paquet', grams: 400, approximate: false }])
  })

  it('lit l’unité d’un lot et écarte un emballage trop grand pour une portion', () => {
    const portions = portionsFromOpenFoodFacts(
      product({ quantity: '12 x 125 g', product_quantity: 1500, product_quantity_unit: 'g' }),
    )

    expect(portions.servings).toEqual([{ label: 'unité', grams: 125, approximate: false }])
  })

  it('convertit les centilitres et ignore une unité inconnue', () => {
    expect(
      portionsFromOpenFoodFacts(product({ product_quantity: 75, product_quantity_unit: 'cl' })),
    ).toEqual({ unit: 'ml', density: 1, servings: [{ label: 'bouteille', grams: 750, approximate: false }] })
    expect(
      portionsFromOpenFoodFacts(product({ serving_quantity: 2, serving_quantity_unit: 'cup' })).servings,
    ).toEqual([])
  })

  it('ne propose rien quand rien n’est renseigné', () => {
    expect(portionsFromOpenFoodFacts(product({ product_name: 'Mystère' }))).toEqual({
      unit: 'g',
      density: 1,
      servings: [],
    })
  })
})

describe('servingName', () => {
  it.each([
    ['25 g (1 tranche)', 'tranche', 1],
    ['1 serving (140 g)', 'portion', 1],
    ['2 biscuits (25 g)', 'biscuit', 2],
    ['1 slice (30g)', 'tranche', 1],
    ['une barre (40 g)', 'barre', 1],
    ['15 ml (1 tbsp)', 'c. à soupe', 1],
    ['30 g', 'portion', 1],
    ['', 'portion', 1],
    ['1/2 pizza (200 g)', 'portion', 1],
  ])('%p → %p × %p', (text, label, count) => {
    expect(servingName(text)).toEqual({ label, count })
  })
})
