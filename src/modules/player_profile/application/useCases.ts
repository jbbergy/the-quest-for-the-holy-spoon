import { ApplicationError, type DomainError, type RepositoryError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

import type { ActivityLevel } from '../domain/ActivityLevel'
import { type BiologicalSex, BodyMeasurements } from '../domain/BodyMeasurements'
import { DietaryPreferences, type DietaryRestriction } from '../domain/DietaryPreferences'
import { Player } from '../domain/Player'
import type { IPlayerRepository } from '../domain/repositories'

/** Erreur que tout Use Case de ce module peut retourner. */
export type ProfileError = ApplicationError | DomainError | RepositoryError

export interface ProfileInput {
  readonly name: string
  readonly heightCm: number
  readonly weightKg: number
  readonly ageYears: number
  readonly biologicalSex: BiologicalSex
  readonly activityLevel: ActivityLevel
  readonly restrictions?: readonly DietaryRestriction[]
  readonly allergens?: readonly string[]
}

/**
 * Crée le profil et l'enregistre.
 *
 * Le Use Case orchestre, il ne décide pas : toute la validation vit dans les
 * Value Objects, et il se contente de propager leurs échecs. C'est ce qui
 * permet de tester les règles métier sans monter de repository.
 */
export class CreatePlayerProfileUseCase {
  constructor(private readonly players: IPlayerRepository) {}

  async execute(input: ProfileInput): Promise<Result<Player, ProfileError>> {
    const player = buildPlayer(input)
    if (!player.ok) return player

    const saved = await this.players.save(player.value)
    if (!saved.ok) {
      return err(
        new ApplicationError(
          'PROFILE_NOT_SAVED',
          `Le profil « ${input.name} » n’a pas pu être enregistré.`,
          { cause: saved.error },
        ),
      )
    }

    return ok(player.value)
  }
}

/** Charge le profil actif de l'appareil. `null` tant que l'onboarding n'a pas eu lieu. */
export class GetCurrentPlayerUseCase {
  constructor(private readonly players: IPlayerRepository) {}

  async execute(): Promise<Result<Player | null, ProfileError>> {
    const found = await this.players.findCurrent()
    if (!found.ok) {
      return err(
        new ApplicationError('PROFILE_NOT_LOADED', 'Le profil n’a pas pu être chargé.', {
          cause: found.error,
        }),
      )
    }
    return ok(found.value)
  }
}

export interface ProfileUpdate {
  readonly name?: string
  readonly weightKg?: number
  readonly heightCm?: number
  readonly ageYears?: number
  readonly activityLevel?: ActivityLevel
  readonly restrictions?: readonly DietaryRestriction[]
  readonly allergens?: readonly string[]
}

/**
 * Met à jour le profil courant.
 *
 * Chaque étape produit une **nouvelle instance** de `Player` ; rien n'est muté
 * en place. L'ancienne instance reste valide, ce que la couche présentation
 * exploite pour comparer l'avant et l'après et animer la transition.
 */
export class UpdatePlayerProfileUseCase {
  constructor(private readonly players: IPlayerRepository) {}

  async execute(update: ProfileUpdate): Promise<Result<Player, ProfileError>> {
    const current = await this.players.findCurrent()
    if (!current.ok) {
      return err(
        new ApplicationError('PROFILE_NOT_LOADED', 'Le profil n’a pas pu être chargé.', {
          cause: current.error,
        }),
      )
    }
    if (current.value === null) {
      return err(new ApplicationError('NO_CURRENT_PROFILE', 'Aucun profil à mettre à jour.'))
    }

    const updated = applyUpdate(current.value, update)
    if (!updated.ok) return updated

    const saved = await this.players.save(updated.value)
    if (!saved.ok) {
      return err(
        new ApplicationError('PROFILE_NOT_SAVED', 'La mise à jour n’a pas pu être enregistrée.', {
          cause: saved.error,
        }),
      )
    }

    return ok(updated.value)
  }
}

function buildPlayer(input: ProfileInput): Result<Player, DomainError> {
  const measurements = BodyMeasurements.create({
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    ageYears: input.ageYears,
    biologicalSex: input.biologicalSex,
  })
  if (!measurements.ok) return measurements

  const preferences = DietaryPreferences.create({
    restrictions: input.restrictions ?? [],
    allergens: input.allergens ?? [],
  })
  if (!preferences.ok) return preferences

  return Player.create({
    name: input.name,
    measurements: measurements.value,
    activityLevel: input.activityLevel,
    preferences: preferences.value,
  })
}

/**
 * Applique les champs fournis, un par un, en repartant à chaque fois de
 * l'instance précédente. Les mesures sont regroupées en une seule reconstruction
 * pour qu'une combinaison invalide (poids plausible mais âge aberrant) soit
 * rejetée d'un bloc plutôt qu'à moitié appliquée.
 */
function applyUpdate(player: Player, update: ProfileUpdate): Result<Player, DomainError> {
  let next = player

  if (hasMeasurementChange(update)) {
    const measurements = BodyMeasurements.create({
      heightCm: update.heightCm ?? player.measurements.heightCm,
      weightKg: update.weightKg ?? player.measurements.weightKg,
      ageYears: update.ageYears ?? player.measurements.ageYears,
      biologicalSex: player.measurements.biologicalSex,
    })
    if (!measurements.ok) return measurements
    next = next.withMeasurements(measurements.value)
  }

  if (update.restrictions !== undefined || update.allergens !== undefined) {
    const preferences = DietaryPreferences.create({
      restrictions: update.restrictions ?? player.preferences.restrictions,
      allergens: update.allergens ?? player.preferences.allergens,
    })
    if (!preferences.ok) return preferences
    next = next.withPreferences(preferences.value)
  }

  if (update.activityLevel !== undefined) next = next.withActivityLevel(update.activityLevel)

  if (update.name !== undefined) {
    const renamed = next.rename(update.name)
    if (!renamed.ok) return renamed
    next = renamed.value
  }

  return ok(next)
}

function hasMeasurementChange(update: ProfileUpdate): boolean {
  return (
    update.heightCm !== undefined ||
    update.weightKg !== undefined ||
    update.ageYears !== undefined
  )
}
