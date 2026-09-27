import { describe, expect, it } from 'vitest'

import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { ciqualTags } from '@/modules/nutrition_inventory/infrastructure/ciqualTags'

describe('ciqualTags', () => {
  it('déduit les marqueurs du sous-groupe', () => {
    expect(ciqualTags('0410', 'Oeuf, dur')).toContain(FoodTag.CONTAINS_EGG)
    expect(ciqualTags('0503', 'Emmental')).toContain(FoodTag.CONTAINS_MILK)
    expect(ciqualTags('0302', 'Baguette, courante')).toContain(FoodTag.CONTAINS_GLUTEN)
    expect(ciqualTags('0406', 'Saumon, cru')).toEqual([FoodTag.CONTAINS_FISH])
  })

  it('lit le nom des plats composés, sans accents ni majuscules', () => {
    const lasagnes = ciqualTags('0103', 'Lasagnes ou cannelloni à la viande (bolognaise)')
    expect(lasagnes).toEqual(
      expect.arrayContaining([FoodTag.CONTAINS_MEAT, FoodTag.CONTAINS_GLUTEN]),
    )
    expect(ciqualTags('0103', 'Tajine de mouton')).toContain(FoodTag.CONTAINS_MEAT)
    expect(ciqualTags('0103', 'Gratin dauphinois')).toContain(FoodTag.CONTAINS_MILK)
    expect(ciqualTags('1001', 'Mayonnaise (70% MG min.), préemballée')).toContain(
      FoodTag.CONTAINS_EGG,
    )
  })

  it('ne confond pas un mot avec un morceau de mot', () => {
    // « thon » dans « Marathon », « porc » dans « Porcelaine » : aucun marqueur.
    expect(ciqualTags('0602', 'Boisson Marathon')).toEqual([])
    expect(ciqualTags('0204', 'Confiture de porcelaine')).toEqual([])
  })

  it('écarte les faux amis', () => {
    expect(ciqualTags('0602', 'Lait de coco, boisson')).not.toContain(FoodTag.CONTAINS_MILK)
    expect(ciqualTags('0201', 'Haricot beurre, cru')).not.toContain(FoodTag.CONTAINS_MILK)
    expect(ciqualTags('0703', 'Pâte de fruits')).not.toContain(FoodTag.CONTAINS_GLUTEN)
    expect(ciqualTags('0104', 'Galette de sarrasin, nature')).not.toContain(
      FoodTag.CONTAINS_GLUTEN,
    )
    expect(ciqualTags('0103', 'Hachis parmentier végétarien')).not.toContain(
      FoodTag.CONTAINS_MEAT,
    )
  })

  it('garde le gluten d’un plat qui cite aussi du riz ou du maïs', () => {
    expect(ciqualTags('0104', 'Pizza jambon maïs, préemballée')).toContain(FoodTag.CONTAINS_GLUTEN)
    expect(ciqualTags('0301', 'Semoule de maïs (polenta), cuite')).not.toContain(
      FoodTag.CONTAINS_GLUTEN,
    )
  })

  it('admet ce que le nom dit sans gluten ou sans lactose', () => {
    const bread = ciqualTags('0302', 'Pain sans gluten')
    expect(bread).toContain(FoodTag.GLUTEN_FREE)
    expect(ciqualTags('0501', 'Lait délactosé, demi-écrémé')).toContain(FoodTag.LACTOSE_FREE)
  })

  it('range crustacés et coquillages à part du poisson', () => {
    expect(ciqualTags('0407', 'Crevette, cuite')).toEqual([FoodTag.CONTAINS_SHELLFISH])
    expect(ciqualTags('0106', 'Feuilleté aux escargots, préemballé')).toContain(
      FoodTag.CONTAINS_SHELLFISH,
    )
    // « Fruits à coque » n'est pas un coquillage, ni la grenouille un crustacé.
    expect(ciqualTags('0706', 'Gaufrette fourrée fruits à coque')).not.toContain(
      FoodTag.CONTAINS_SHELLFISH,
    )
    expect(ciqualTags('0408', 'Grenouille, cuisse, crue')).not.toContain(
      FoodTag.CONTAINS_SHELLFISH,
    )
  })

  it('marque le porc des charcuteries, sauf celles d’un autre animal', () => {
    expect(ciqualTags('0403', 'Saucisson sec')).toContain(FoodTag.CONTAINS_PORK)
    expect(ciqualTags('0104', 'Quiche lorraine, préemballée')).toContain(FoodTag.CONTAINS_PORK)
    expect(ciqualTags('0403', 'Jambon de dinde ou Blanc de dinde en tranche')).not.toContain(
      FoodTag.CONTAINS_PORK,
    )
    expect(ciqualTags('0403', 'Rillettes de canard')).not.toContain(FoodTag.CONTAINS_PORK)
    expect(ciqualTags('0409', 'Rillettes de maquereau, préemballées')).not.toContain(
      FoodTag.CONTAINS_PORK,
    )
  })

  it('rétablit le porc ou le bœuf quand le nom les cite malgré un autre animal', () => {
    const merguez = ciqualTags('0403', 'Merguez, boeuf, mouton et porc, crue')
    expect(merguez).toEqual(expect.arrayContaining([FoodTag.CONTAINS_PORK, FoodTag.CONTAINS_BEEF]))
    expect(ciqualTags('0404', 'Boulettes au boeuf et à l\'agneau (type kefta)')).toContain(
      FoodTag.CONTAINS_BEEF,
    )
  })

  it('marque le bœuf et le veau, pas le cheval ni la tomate cœur de bœuf', () => {
    expect(ciqualTags('0103', 'Blanquette de veau')).toContain(FoodTag.CONTAINS_BEEF)
    expect(ciqualTags('0103', 'Chili con carne, préemballé')).toContain(FoodTag.CONTAINS_BEEF)
    expect(ciqualTags('0401', 'Cheval, entrecôte, grillée/poêlée')).not.toContain(
      FoodTag.CONTAINS_BEEF,
    )
    expect(ciqualTags('0201', 'Tomate coeur de boeuf, crue')).toEqual([])
    expect(ciqualTags('1001', 'Sauce tartare, préemballée')).not.toContain(FoodTag.CONTAINS_BEEF)
  })

  it('marque l’alcool des boissons et des plats qui en contiennent', () => {
    expect(ciqualTags('0603', 'Whisky')).toEqual([FoodTag.CONTAINS_ALCOHOL])
    expect(ciqualTags('0709', 'Baba au rhum')).toContain(FoodTag.CONTAINS_ALCOHOL)
    expect(ciqualTags('0103', 'Coq au vin')).toContain(FoodTag.CONTAINS_ALCOHOL)
    // Sans alcool, mais toujours au gluten.
    expect(ciqualTags('0603', 'Bière sans alcool (<1,2° alcool)')).toEqual([
      FoodTag.CONTAINS_GLUTEN,
    ])
    expect(ciqualTags('1002', 'Vinaigre de vin rouge')).toEqual([])
    expect(ciqualTags('0402', 'Boeuf, à bourguignon ou pot-au-feu, cru')).not.toContain(
      FoodTag.CONTAINS_ALCOHOL,
    )
  })

  it('ne marque rien quand rien ne l’indique', () => {
    expect(ciqualTags('0203', 'Lentille verte, cuite')).toEqual([])
  })
})
