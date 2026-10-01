import { addDays, type DayKey } from '@/core/day'
import { InvalidNutritionalNeedsError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Apports moyens des jours précédents, rapportés aux repères habituels.
 *
 * Les repères nutritionnels (ANSES, OMS) sont définis **en moyenne sur la
 * durée**, pas au jour près : l'organisme ne remet pas ses compteurs à zéro à
 * minuit. Une moyenne sur la semaine est donc la lecture la plus fidèle de
 * « où en suis-je » — plus qu'une journée isolée.
 *
 * Ce service **ne modifie aucun objectif**. Faire rattraper un déficit le
 * lendemain, ou retrancher un excès, a été écarté pour trois raisons :
 *
 * - biologiquement, cela n'a guère de sens hors énergie : les protéines ne se
 *   stockent pas pour plus tard, et les fibres agissent par leur régularité ;
 * - les estimations (dépense, portions, valeurs moyennes du catalogue) ont une
 *   marge d'erreur du même ordre que les écarts qu'on prétendrait corriger ;
 * - une logique de dette (« j'ai trop mangé hier, je dois moins manger
 *   aujourd'hui ») entretient les cycles de restriction et d'excès, à l'opposé
 *   de ce que l'application veut apprendre : manger équilibré, sans juger.
 *
 * Une journée sans aucun repas pris n'entre pas dans la moyenne : c'est une
 * journée non renseignée, pas un jeûne. La compter pour zéro ferait croire à un
 * déficit à chaque oubli.
 */

/** Nutriments suivis, et le sens dans lequel chacun se lit. */
export const NUTRIENT_KIND = {
  calories: 'target',
  proteinG: 'target',
  carbsG: 'target',
  fatG: 'target',
  fiberG: 'floor',
  sugarsG: 'limit',
  saturatedFatG: 'limit',
  saltG: 'limit',
} as const
export type Nutrient = keyof typeof NUTRIENT_KIND
/**
 * `target` : un besoin, à approcher par en dessous comme par au-dessus ;
 * `floor` : un minimum, qu'il est bon de dépasser (les fibres) ;
 * `limit` : un plafond, qu'il est bon de ne pas atteindre.
 */
export type NutrientKind = (typeof NUTRIENT_KIND)[Nutrient]
export type NutrientValues = Readonly<Record<Nutrient, number>>

const NUTRIENTS = Object.keys(NUTRIENT_KIND) as readonly Nutrient[]

/** La période observée : les sept jours qui précèdent, la journée en cours exclue. */
export const RECENT_DAYS = 7

/** Ce qui a été effectivement pris un jour donné. Seuls les jours renseignés figurent. */
export interface DailyIntake {
  readonly day: DayKey
  readonly values: NutrientValues
}

export interface NutrientAverage {
  readonly nutrient: Nutrient
  readonly kind: NutrientKind
  /** Besoin (ou limite) du jour observé. */
  readonly base: number
  /** Apport moyen par jour renseigné ; `null` quand aucun jour ne l'est. */
  readonly average: number | null
  /**
   * Écart moyen au repère, chaque jour comparé à **son** repère : négatif en
   * deçà, positif au-delà. Égal à `average − base` tant que les besoins n'ont
   * pas changé pendant la période.
   */
  readonly gap: number | null
}

/** Repères d'un jour : ceux qui valaient ce jour-là, le profil ayant pu changer depuis. */
export type BaseOn = (day: DayKey) => NutrientValues

/** Bilan d'un des jours de la période, pour montrer d'où vient la moyenne. */
export interface DayBalance {
  readonly day: DayKey
  /** `false` quand aucun repas n'a été pris ce jour-là : il n'entre pas dans la moyenne. */
  readonly tracked: boolean
  /** Ce qui a été pris, nutriment par nutriment ; `null` pour un jour non renseigné. */
  readonly intake: NutrientValues | null
  /** Écart « pris − repère » de chaque nutriment ; `null` pour un jour non renseigné. */
  readonly gap: NutrientValues | null
}

export interface RecentIntake {
  readonly day: DayKey
  /** Nombre de jours renseignés parmi les sept : ce sur quoi porte la moyenne. */
  readonly trackedDays: number
  readonly nutrients: Readonly<Record<Nutrient, NutrientAverage>>
  /** Les sept jours précédents, du plus ancien au plus récent. */
  readonly recentDays: readonly DayBalance[]
}

export const RecentIntakeService = {
  /**
   * Moyennes des sept jours qui précèdent `day`.
   *
   * `baseOn` donne les repères de chaque jour : un jour passé se compare aux
   * besoins qu'on avait alors, pas à ceux d'aujourd'hui.
   *
   * `history` peut contenir n'importe quels jours : ceux hors de la période, et
   * le jour lui-même, sont ignorés — la journée en cours n'est pas finie, et
   * la jauge du jour la montre déjà.
   */
  summarize(
    day: DayKey,
    baseOn: BaseOn,
    history: readonly DailyIntake[],
  ): Result<RecentIntake, InvalidNutritionalNeedsError> {
    const days = recentDaysBefore(day)
    const base = baseOn(day)
    for (const checked of [day, ...days]) {
      const invalid = validateBase(baseOn(checked))
      if (invalid !== null) return err(invalid)
    }

    const intakeByDay = new Map(history.map((intake) => [intake.day, intake.values]))
    const tracked = days.flatMap((recent) => {
      const intake = intakeByDay.get(recent)
      return intake === undefined ? [] : [{ intake, gap: gapOf(intake, baseOn(recent)) }]
    })

    const mean = (pick: (entry: (typeof tracked)[number]) => number): number | null =>
      tracked.length === 0
        ? null
        : tracked.reduce((sum, entry) => sum + pick(entry), 0) / tracked.length

    const nutrients = Object.fromEntries(
      NUTRIENTS.map((nutrient) => [
        nutrient,
        {
          nutrient,
          kind: NUTRIENT_KIND[nutrient],
          base: base[nutrient],
          average: mean((entry) => entry.intake[nutrient]),
          gap: mean((entry) => entry.gap[nutrient]),
        },
      ]),
    ) as Record<Nutrient, NutrientAverage>

    const recentDays = days.map((recent) => {
      const intake = intakeByDay.get(recent)
      return intake === undefined
        ? { day: recent, tracked: false, intake: null, gap: null }
        : { day: recent, tracked: true, intake, gap: gapOf(intake, baseOn(recent)) }
    })

    return ok({ day, trackedDays: tracked.length, nutrients, recentDays })
  },
} as const

/** Les sept jours qui précèdent `day`, du plus ancien au plus récent. */
function recentDaysBefore(day: DayKey): DayKey[] {
  return Array.from({ length: RECENT_DAYS }, (_, index) => addDays(day, index - RECENT_DAYS))
}

function gapOf(intake: NutrientValues, base: NutrientValues): NutrientValues {
  return Object.fromEntries(
    NUTRIENTS.map((nutrient) => [nutrient, intake[nutrient] - base[nutrient]]),
  ) as Record<Nutrient, number>
}

function validateBase(base: NutrientValues): InvalidNutritionalNeedsError | null {
  if (!Number.isFinite(base.calories) || base.calories <= 0) {
    return new InvalidNutritionalNeedsError(
      `La cible calorique doit être strictement positive (reçu ${base.calories}).`,
    )
  }
  for (const nutrient of NUTRIENTS) {
    const value = base[nutrient]
    if (!Number.isFinite(value) || value < 0) {
      return new InvalidNutritionalNeedsError(
        `Le repère «\u00A0${nutrient}\u00A0» doit être un nombre positif (reçu ${value}).`,
      )
    }
  }
  return null
}
