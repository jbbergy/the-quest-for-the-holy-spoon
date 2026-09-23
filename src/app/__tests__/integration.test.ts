import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AppContainer, createContainer } from '@/app/composition'
import { collectExport } from '@/app/useDataExport'
import { addDays, dayKeyOf } from '@/core/day'
import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { MealType } from '@/modules/nutrition_inventory/application'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { toNutritionalNeeds } from '@/modules/player_profile/application'

/**
 * Test d'intégration du **vrai** conteneur.
 *
 * Aucun double ici, hormis la source du catalogue : vraies entités, vrais
 * repositories IndexedDB, vrai câblage de `composition.ts`. C'est le seul
 * endroit qui vérifie que les trois contextes fonctionnent ensemble — chacun étant déjà couvert isolément par ailleurs.
 */
const CATALOG = [
  {
    code: '36007',
    name: 'Poulet, blanc, cru',
    group: 'viandes, œufs, poissons et assimilés',
    subGroupCode: '0402',
    subGroup: 'viandes crues',
    proteinG: 21.2,
    carbsG: 0,
    fatG: 4.3,
  },
  {
    code: '39212',
    name: 'Riz blanc, cuit',
    group: 'produits céréaliers',
    subGroupCode: '0301',
    subGroup: 'pâtes, riz et céréales',
    proteinG: 2.5,
    carbsG: 28,
    fatG: 0.3,
  },
]

let container: AppContainer

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => CATALOG,
  })) as unknown as typeof fetch

  container = createContainer({ network: new StaticNetworkStatus(false) })
})

describe('parcours complet', () => {
  it('amorce le catalogue au premier lancement et pas au suivant', async () => {
    expect(unwrap(await container.seedCatalog())).toEqual({ seeded: true, count: 2 })

    const second = createContainer({ network: new StaticNetworkStatus(false) })
    expect(unwrap(await second.seedCatalog())).toEqual({
      seeded: false,
      reason: 'already_current',
    })
    await second.dispose()
  })

  it('enchaîne onboarding, recherche, repas et recommandation', async () => {
    await container.seedCatalog()

    // 1. Onboarding.
    const player = unwrap(
      await container.profile.create.execute({
        name: 'Perceval',
        heightCm: 180,
        weightKg: 80,
        ageYears: 30,
        biologicalSex: BiologicalSex.MALE,
        activityLevel: ActivityLevel.MODERATE,
      }),
    )
    expect(unwrap(await container.profile.getCurrent.execute())?.id).toBe(player.id)

    // 2. Recherche dans le catalogue amorcé.
    const found = unwrap(await container.inventory.find.execute('poulet')).items
    expect(found[0]?.name).toBe('Poulet, blanc, cru')

    // 3. Repas.
    const meal = unwrap(
      await container.inventory.addFood.execute({
        playerId: player.id,
        foodItemId: found[0]!.id,
        grams: 200,
        mealType: MealType.LUNCH,
      }),
    )
    expect(meal.calculateTotals().macros.proteinG).toBeCloseTo(42.4, 6)

    // 3 bis. Composer ne suffit pas : le repas n'entre dans les totaux qu'une
    //        fois déclaré pris.
    const beforeEating = unwrap(await container.inventory.journal.execute(player.id, new Date()))
    expect(beforeEating.meals).toHaveLength(1)
    expect(beforeEating.totalCalories).toBe(0)

    unwrap(await container.inventory.markConsumed.execute(meal.id, true))

    // 4. Journal et recommandation.
    const journal = unwrap(
      await container.inventory.journal.execute(player.id, new Date()),
    )
    expect(journal.meals).toHaveLength(1)
    expect(journal.consumedMeals).toHaveLength(1)
    expect(journal.totalCalories).toBeGreaterThan(0)

    const suggestion = unwrap(
      container.planning.suggestCompletion.execute(
        toNutritionalNeeds(player),
        journal.consumedMeals,
      ),
    )
    expect(suggestion.remainingCalories).toBeCloseTo(
      player.targetCalories() - journal.totalCalories,
      6,
    )
  })

  it('planifie un repas pour un autre jour sans toucher à la journée en cours', async () => {
    await container.seedCatalog()
    const player = unwrap(
      await container.profile.create.execute({
        name: 'Perceval',
        heightCm: 180,
        weightKg: 80,
        ageYears: 30,
        biologicalSex: BiologicalSex.MALE,
        activityLevel: ActivityLevel.MODERATE,
      }),
    )
    const food = unwrap(await container.inventory.find.execute('riz')).items[0]!
    const today = dayKeyOf(new Date())
    const tomorrow = addDays(today, 1)

    const meal = unwrap(
      await container.inventory.addFood.execute({
        playerId: player.id,
        foodItemId: food.id,
        grams: 200,
        mealType: MealType.DINNER,
        plannedFor: tomorrow,
      }),
    )

    // Le repas de demain n'apparaît pas sur l'accueil d'aujourd'hui…
    const todayJournal = unwrap(await container.inventory.journal.execute(player.id, new Date()))
    expect(todayJournal.meals).toEqual([])

    // … mais bien dans la semaine, à son jour, avec ses calories prévues.
    const week = unwrap(await container.inventory.week.execute(player.id, tomorrow))
    const planned = week.days.find((day) => day.day === tomorrow)
    expect(planned?.meals.map((summary) => summary.mealId)).toEqual([meal.id])
    expect(planned?.plannedCalories).toBeGreaterThan(0)

    // Il ne peut pas encore être déclaré pris.
    const eaten = await container.inventory.markConsumed.execute(meal.id, true)
    expect(eaten.ok).toBe(false)

    // Ramené à aujourd'hui, il rejoint l'accueil et peut l'être.
    unwrap(
      await container.inventory.reschedule.execute(meal.id, {
        plannedFor: today,
        type: MealType.DINNER,
      }),
    )
    unwrap(await container.inventory.markConsumed.execute(meal.id, true))
    const after = unwrap(await container.inventory.journal.execute(player.id, new Date()))
    expect(after.consumedMeals.map((summary) => summary.mealId)).toEqual([meal.id])
  })

  it('exporte les données du joueur en traversant les deux contextes', async () => {
    await container.seedCatalog()

    const player = unwrap(
      await container.profile.create.execute({
        name: 'Perceval',
        heightCm: 180,
        weightKg: 80,
        ageYears: 30,
        biologicalSex: BiologicalSex.MALE,
        activityLevel: ActivityLevel.MODERATE,
      }),
    )
    const mine = unwrap(
      await container.inventory.createCustomFood.execute({
        name: 'Gratin de ma grand-mère',
        proteinG: 8,
        carbsG: 12,
        fatG: 9,
      }),
    )
    const food = unwrap(await container.inventory.find.execute('riz')).items[0]!
    const meal = unwrap(
      await container.inventory.addFood.execute({
        playerId: player.id,
        foodItemId: food.id,
        grams: 150,
        mealType: MealType.LUNCH,
      }),
    )
    unwrap(await container.inventory.markConsumed.execute(meal.id, true))

    const archive = unwrap(await collectExport(container, new Date('2026-09-22T21:45:00')))

    expect(archive.player.name).toBe('Perceval')
    expect(archive.meals).toHaveLength(1)
    expect(archive.meals[0]?.consumedAt).not.toBeNull()
    expect(archive.meals[0]?.entries[0]?.grams).toBe(150)

    // Le catalogue Ciqual amorcé plus haut ne doit pas s'inviter dans l'archive :
    // seule la fiche créée par l'utilisateur lui appartient.
    expect(archive.customFoods.map((item) => item.id)).toEqual([mine.id])
  })

  it('n’exporte aucun champ hérité des objectifs retirés', async () => {
    /*
     * Verrou de bout en bout. Un profil relu depuis IndexedDB passe par
     * `recordToPlayer`, qui ignore les clés inconnues : l'archive ne peut donc
     * pas ressusciter le `goal` des profils enregistrés avant son retrait. Ce
     * test échouerait si l'export venait un jour à sérialiser l'enregistrement
     * brut plutôt que l'entité.
     */
    await container.profile.create.execute({
      name: 'Perceval',
      heightCm: 180,
      weightKg: 80,
      ageYears: 30,
      biologicalSex: BiologicalSex.MALE,
      activityLevel: ActivityLevel.MODERATE,
    })

    const archive = unwrap(await collectExport(container, new Date('2026-09-22T21:45:00')))

    expect(JSON.stringify(archive)).not.toContain('goal')
  })

  it('bascule sur le catalogue local quand le réseau est coupé', async () => {
    await container.seedCatalog()

    const found = unwrap(await container.inventory.find.execute('3017620422003'))

    expect(found.kind).toBe('by_barcode')
    // Le réseau est coupé dans ce conteneur : l'UI doit pouvoir dire
    // « résultats du catalogue local uniquement » plutôt que « produit inconnu ».
    expect(found.onlineSearched).toBe(false)
  })

  it('cherche par nom dans le catalogue local sans réseau', async () => {
    await container.seedCatalog()

    const found = unwrap(await container.inventory.find.execute('riz'))

    expect(found.items.length).toBeGreaterThan(0)
    expect(found.onlineSearched).toBe(false)
  })

})
