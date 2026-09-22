import { InvalidMeasurementError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Sexe biologique — utilisé uniquement comme paramètre de l'équation de
 * Mifflin-St Jeor, qui n'en connaît que deux branches. C'est une donnée de
 * calcul métabolique, distincte de l'identité de la personne.
 */
export const BiologicalSex = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
} as const
export type BiologicalSex = (typeof BiologicalSex)[keyof typeof BiologicalSex]

/** Bornes physiologiques plausibles : au-delà, c'est une faute de saisie. */
export const MEASUREMENT_BOUNDS = {
  heightCm: { min: 50, max: 272 },
  weightKg: { min: 20, max: 640 },
  ageYears: { min: 13, max: 120 },
} as const

export interface BodyMeasurementsProps {
  readonly heightCm: number
  readonly weightKg: number
  readonly ageYears: number
  readonly biologicalSex: BiologicalSex
}

/**
 * Mesures corporelles du joueur.
 *
 * Isolées du `Player` pour que le calcul du BMR soit testable seul et qu'une
 * mise à jour de poids reste une opération triviale et sûre.
 */
export class BodyMeasurements {
  private constructor(
    readonly heightCm: number,
    readonly weightKg: number,
    readonly ageYears: number,
    readonly biologicalSex: BiologicalSex,
  ) {}

  static create(
    props: BodyMeasurementsProps,
  ): Result<BodyMeasurements, InvalidMeasurementError> {
    const checks: readonly [string, number, { min: number; max: number }][] = [
      ['La taille', props.heightCm, MEASUREMENT_BOUNDS.heightCm],
      ['Le poids', props.weightKg, MEASUREMENT_BOUNDS.weightKg],
      ['L’âge', props.ageYears, MEASUREMENT_BOUNDS.ageYears],
    ]

    for (const [label, value, bounds] of checks) {
      if (!Number.isFinite(value)) {
        return err(new InvalidMeasurementError(`${label} doit être un nombre fini.`))
      }
      if (value < bounds.min || value > bounds.max) {
        return err(
          new InvalidMeasurementError(
            `${label} doit être comprise entre ${bounds.min} et ${bounds.max} (reçu ${value}).`,
          ),
        )
      }
    }

    return ok(
      new BodyMeasurements(props.heightCm, props.weightKg, props.ageYears, props.biologicalSex),
    )
  }

  static reconstitute(props: BodyMeasurementsProps): BodyMeasurements {
    return new BodyMeasurements(
      props.heightCm,
      props.weightKg,
      props.ageYears,
      props.biologicalSex,
    )
  }

  /**
   * Métabolisme de base, équation de **Mifflin-St Jeor** (1990) :
   * `10·poids(kg) + 6.25·taille(cm) − 5·âge + s`, avec `s = +5` pour un homme
   * et `s = −161` pour une femme. Résultat en kcal/jour.
   */
  basalMetabolicRate(): number {
    const base = 10 * this.weightKg + 6.25 * this.heightCm - 5 * this.ageYears
    return base + (this.biologicalSex === BiologicalSex.MALE ? 5 : -161)
  }

  withWeight(weightKg: number): Result<BodyMeasurements, InvalidMeasurementError> {
    return BodyMeasurements.create({ ...this.toJSON(), weightKg })
  }

  withHeight(heightCm: number): Result<BodyMeasurements, InvalidMeasurementError> {
    return BodyMeasurements.create({ ...this.toJSON(), heightCm })
  }

  withAge(ageYears: number): Result<BodyMeasurements, InvalidMeasurementError> {
    return BodyMeasurements.create({ ...this.toJSON(), ageYears })
  }

  equals(other: BodyMeasurements): boolean {
    return (
      this.heightCm === other.heightCm &&
      this.weightKg === other.weightKg &&
      this.ageYears === other.ageYears &&
      this.biologicalSex === other.biologicalSex
    )
  }

  toJSON(): BodyMeasurementsProps {
    return {
      heightCm: this.heightCm,
      weightKg: this.weightKg,
      ageYears: this.ageYears,
      biologicalSex: this.biologicalSex,
    }
  }
}
