import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateServings } from '@/modules/nutrition_inventory/domain/Measure'
import { ciqualPortions } from '@/modules/nutrition_inventory/infrastructure/ciqualPortions'
import { ciqualCatalogSchema } from '@/modules/nutrition_inventory/infrastructure/ciqualSchema'

const labels = (subGroup: string, name: string) =>
  ciqualPortions(subGroup, name).servings.map((serving) => `${serving.label}=${serving.grams}`)

describe('ciqualPortions', () => {
  it('donne à chaque aliment courant sa portion naturelle', () => {
    expect(labels('0410', 'Oeuf, dur')).toEqual(['œuf=50'])
    expect(labels('0302', 'Pain de mie, complet')).toEqual(['tranche=25'])
    expect(labels('0502', 'Yaourt, lait fermenté ou spécialité laitière, nature')).toEqual(['pot=125'])
    expect(labels('0204', 'Pomme, pulpe et peau, crue')).toEqual(['pomme=150'])
    expect(labels('0301', 'Pâtes sèches standard, cuites, non salées')).toEqual(['assiette=200'])
    expect(labels('0301', 'Pâtes sèches standard, crues')).toEqual(['portion=70'])
  })

  it('mesure les liquides en millilitres, portions converties par la densité', () => {
    const milk = ciqualPortions('0501', 'Lait demi-écrémé, UHT')
    expect(milk.unit).toBe('ml')
    expect(milk.density).toBe(1.03)
    // Un verre de 200 ml de lait pèse 206 g : c'est ce qu'attend une fiche pour 100 g.
    expect(milk.servings[0]).toEqual({ label: 'verre', grams: 206, approximate: true })

    expect(labels('0902', 'Huile d\'olive vierge extra')).toEqual(['c. à café=4.6', 'c. à soupe=13.8'])
  })

  it('préfère la règle par nom à celle du sous-groupe, et sait écarter un nom', () => {
    expect(labels('0501', 'Lait en poudre, écrémé')).toEqual(['c. à soupe=8'])
    expect(ciqualPortions('0501', 'Lait en poudre, écrémé').unit).toBe('g')
    expect(labels('0202', 'Pomme de terre, flocons déshydratés, nature')).toEqual([])
    expect(labels('0204', 'Pomme cannelle,  pulpe, crue, prélevée à la Martinique')).toEqual([])
  })

  it('laisse en grammes ce qu’aucune règle ne couvre', () => {
    expect(ciqualPortions('1104', 'Céréales infantiles')).toEqual({ unit: 'g', density: 1, servings: [] })
  })

  it('produit des portions valides pour tout le catalogue', () => {
    const catalog = ciqualCatalogSchema.parse(
      JSON.parse(readFileSync(resolve(__dirname, '../../../../../public/data/ciqual.json'), 'utf8')),
    )
    let covered = 0
    for (const food of catalog) {
      const portions = ciqualPortions(food.subGroupCode, food.name)
      expect(validateServings(portions.servings).ok, food.name).toBe(true)
      if (portions.servings.length > 0) covered += 1
    }
    // Garde-fou : une règle cassée ferait chuter la couverture sans rien signaler.
    expect(covered / catalog.length).toBeGreaterThan(0.85)
  })
})
