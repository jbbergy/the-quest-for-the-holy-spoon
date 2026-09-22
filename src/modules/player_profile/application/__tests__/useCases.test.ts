import { beforeEach, describe, expect, it } from 'vitest'

import { err, isErr } from '@/core/result'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryRestriction } from '@/modules/player_profile/domain/DietaryPreferences'
import { InMemoryPlayerRepository } from '@/modules/player_profile/infrastructure/InMemoryPlayerRepository'
import {
  CreatePlayerProfileUseCase,
  GetCurrentPlayerUseCase,
  type ProfileInput,
  UpdatePlayerProfileUseCase,
} from '@/modules/player_profile/application/useCases'
import {
  type PlayerExport,
  toNutritionalNeeds,
  toPlayerExport,
} from '@/modules/player_profile/application'

let players: InMemoryPlayerRepository

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw new Error(`échec : ${result.error.message}`)
  return result.value
}

const validInput: ProfileInput = {
  name: 'Perceval',
  heightCm: 180,
  weightKg: 80,
  ageYears: 30,
  biologicalSex: BiologicalSex.MALE,
  activityLevel: ActivityLevel.MODERATE,
}

beforeEach(() => {
  players = new InMemoryPlayerRepository()
})

describe('CreatePlayerProfileUseCase', () => {
  it('crée et enregistre le profil', async () => {
    const player = unwrap(await new CreatePlayerProfileUseCase(players).execute(validInput))

    expect(player.name).toBe('Perceval')
    expect(unwrap(await players.findById(player.id))?.id).toBe(player.id)
  })

  it('en fait le profil courant', async () => {
    const player = unwrap(await new CreatePlayerProfileUseCase(players).execute(validInput))

    expect(unwrap(await players.findCurrent())?.id).toBe(player.id)
  })

  it('applique les préférences alimentaires fournies', async () => {
    const player = unwrap(
      await new CreatePlayerProfileUseCase(players).execute({
        ...validInput,
        restrictions: [DietaryRestriction.VEGAN],
        allergens: ['  Arachide '],
      }),
    )

    expect(player.preferences.has(DietaryRestriction.VEGAN)).toBe(true)
    expect(player.preferences.isAllergicTo('arachide')).toBe(true)
  })

  it.each([
    ['mesures hors bornes', { weightKg: 5 }, 'INVALID_MEASUREMENT'],
    ['nom vide', { name: '  ' }, 'INVALID_PLAYER'],
  ])('propage l’échec de validation : %s', async (_label, override, code) => {
    const result = await new CreatePlayerProfileUseCase(players).execute({
      ...validInput,
      ...override,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe(code)
  })

  it('refuse des restrictions contradictoires', async () => {
    const result = await new CreatePlayerProfileUseCase(players).execute({
      ...validInput,
      restrictions: [DietaryRestriction.VEGAN, DietaryRestriction.PESCATARIAN],
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INCOMPATIBLE_DIETARY_RESTRICTION')
  })

  it('n’enregistre rien quand la validation échoue', async () => {
    await new CreatePlayerProfileUseCase(players).execute({ ...validInput, name: '' })

    expect(unwrap(await players.findCurrent())).toBeNull()
  })

  it('enveloppe une panne de stockage', async () => {
    const broken = {
      save: async () => err(Object.assign(new Error('disque plein'), { code: 'X' })),
    } as unknown as InMemoryPlayerRepository

    const result = await new CreatePlayerProfileUseCase(broken).execute(validInput)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('PROFILE_NOT_SAVED')
      expect((result.error.cause as Error).message).toBe('disque plein')
    }
  })
})

describe('GetCurrentPlayerUseCase', () => {
  it('retourne null avant tout onboarding', async () => {
    expect(unwrap(await new GetCurrentPlayerUseCase(players).execute())).toBeNull()
  })

  it('retourne le profil enregistré', async () => {
    await new CreatePlayerProfileUseCase(players).execute(validInput)

    const player = unwrap(await new GetCurrentPlayerUseCase(players).execute())

    expect(player?.name).toBe('Perceval')
  })

  it('enveloppe une panne de lecture', async () => {
    const broken = {
      findCurrent: async () => err(Object.assign(new Error('panne'), { code: 'X' })),
    } as unknown as InMemoryPlayerRepository

    const result = await new GetCurrentPlayerUseCase(broken).execute()

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('PROFILE_NOT_LOADED')
  })
})

describe('UpdatePlayerProfileUseCase', () => {
  beforeEach(async () => {
    await new CreatePlayerProfileUseCase(players).execute(validInput)
  })

  const update = (): UpdatePlayerProfileUseCase => new UpdatePlayerProfileUseCase(players)

  it('met à jour le poids et recalcule les besoins', async () => {
    const before = unwrap(await players.findCurrent())!

    const after = unwrap(await update().execute({ weightKg: 90 }))

    expect(after.measurements.weightKg).toBe(90)
    expect(after.basalMetabolicRate()).toBeCloseTo(before.basalMetabolicRate() + 100, 10)
  })

  it('produit une nouvelle instance sans muter l’ancienne', async () => {
    const before = unwrap(await players.findCurrent())!

    const after = unwrap(await update().execute({ activityLevel: ActivityLevel.SEDENTARY }))

    expect(after).not.toBe(before)
    expect(after.id).toBe(before.id)
    expect(before.activityLevel).toBe(ActivityLevel.MODERATE)
  })

  it('persiste la mise à jour', async () => {
    await update().execute({ activityLevel: ActivityLevel.VERY_ACTIVE })

    expect(unwrap(await players.findCurrent())?.activityLevel).toBe(ActivityLevel.VERY_ACTIVE)
  })

  it('ne touche qu’aux champs fournis', async () => {
    const after = unwrap(await update().execute({ name: 'Karadoc' }))

    expect(after.name).toBe('Karadoc')
    expect(after.measurements.weightKg).toBe(80)
    expect(after.activityLevel).toBe(ActivityLevel.MODERATE)
  })

  it('applique plusieurs champs en une passe', async () => {
    const after = unwrap(
      await update().execute({
        weightKg: 75,
        activityLevel: ActivityLevel.SEDENTARY,
        restrictions: [DietaryRestriction.VEGETARIAN],
      }),
    )

    expect(after.measurements.weightKg).toBe(75)
    expect(after.activityLevel).toBe(ActivityLevel.SEDENTARY)
    expect(after.preferences.has(DietaryRestriction.VEGETARIAN)).toBe(true)
  })

  it('rejette d’un bloc une combinaison de mesures invalide', async () => {
    // Poids plausible mais âge aberrant : la reconstruction groupée refuse
    // l'ensemble plutôt que d'appliquer la moitié de la demande.
    const result = await update().execute({ weightKg: 75, ageYears: 200 })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('INVALID_MEASUREMENT')
    expect(unwrap(await players.findCurrent())?.measurements.weightKg).toBe(80)
  })

  it('refuse un renommage invalide sans rien enregistrer', async () => {
    const result = await update().execute({ name: '   ' })

    expect(isErr(result)).toBe(true)
    expect(unwrap(await players.findCurrent())?.name).toBe('Perceval')
  })

  it('signale l’absence de profil à mettre à jour', async () => {
    const empty = new UpdatePlayerProfileUseCase(new InMemoryPlayerRepository())

    const result = await empty.execute({ weightKg: 80 })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('NO_CURRENT_PROFILE')
  })

  it('met à jour le read model consommé par planning', async () => {
    const after = unwrap(await update().execute({ activityLevel: ActivityLevel.SEDENTARY }))

    const needs = toNutritionalNeeds(after)

    // La cible, c'est la dépense : l'application vise l'équilibre, pas l'écart.
    expect(needs.targetCalories).toBe(after.totalDailyEnergyExpenditure())
    expect(needs.playerId).toBe(after.id)
  })
})

describe('toPlayerExport', () => {
  const exported = async (): Promise<PlayerExport> =>
    toPlayerExport(
      unwrap(
        await new CreatePlayerProfileUseCase(players).execute({
          ...validInput,
          restrictions: [DietaryRestriction.VEGETARIAN],
          allergens: ['Arachide'],
        }),
      ),
    )

  it('aplatit les mesures et les préférences telles qu’elles ont été saisies', async () => {
    expect(await exported()).toMatchObject({
      name: 'Perceval',
      heightCm: 180,
      weightKg: 80,
      ageYears: 30,
      biologicalSex: BiologicalSex.MALE,
      activityLevel: ActivityLevel.MODERATE,
      restrictions: [DietaryRestriction.VEGETARIAN],
      allergens: ['arachide'],
    })
  })

  it('joint les valeurs dérivées, pour situer l’historique sans l’application', async () => {
    const player = unwrap(await new CreatePlayerProfileUseCase(players).execute(validInput))

    expect(toPlayerExport(player)).toMatchObject({
      basalMetabolicRate: player.basalMetabolicRate(),
      totalDailyEnergyExpenditure: player.totalDailyEnergyExpenditure(),
      targetCalories: player.targetCalories(),
    })
  })

  it('ne porte aucune trace d’un objectif de transformation corporelle', async () => {
    /*
     * Verrou d'intention. Les profils enregistrés avant le retrait des objectifs
     * gardent un champ `goal` orphelin en base ; l'export passant par l'entité,
     * il ne peut pas le ressusciter. Ce test échouerait si quelqu'un rebranchait
     * l'export sur l'enregistrement stocké — ou réintroduisait la notion.
     */
    expect(Object.keys(await exported())).not.toContain('goal')
  })
})
