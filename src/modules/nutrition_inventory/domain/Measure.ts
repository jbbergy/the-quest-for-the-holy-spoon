import { InvalidFoodItemError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Unité dans laquelle une fiche se mesure au plus simple : le gramme pour un
 * solide, le millilitre pour un liquide.
 */
export const BaseUnit = {
  GRAM: 'g',
  MILLILITRE: 'ml',
} as const
export type BaseUnit = (typeof BaseUnit)[keyof typeof BaseUnit]

/**
 * Une portion nommée d'un aliment : « tranche », « pot », « c. à soupe ».
 *
 * `grams` est la masse d'**une** unité, dans le référentiel des valeurs
 * nutritionnelles de la fiche — donc, pour un liquide d'Open Food Facts dont les
 * valeurs sont données pour 100 ml, des millilitres. `approximate` distingue
 * une moyenne (les portions déduites pour Ciqual) d'une valeur lue sur
 * l'emballage ou fixée par l'utilisateur : l'écran l'affiche précédée de « ≈ ».
 */
export interface Serving {
  readonly label: string
  readonly grams: number
  readonly approximate: boolean
}

/**
 * Ce en quoi une quantité est saisie, puis réaffichée : grammes, millilitres ou
 * portion nommée.
 *
 * La quantité elle-même reste toujours stockée en grammes — c'est ce que les
 * calculs attendent. La mesure ne sert qu'à dire « 2 tranches » plutôt que
 * « 50 g » : `amount = grams / measure.grams`.
 */
export interface Measure {
  readonly label: string
  /** Masse d'une unité : 1 pour le gramme, la densité pour le millilitre. */
  readonly grams: number
  /** Une portion se compte (½, 1, 2…) ; un gramme ou un millilitre se mesure. */
  readonly countable: boolean
  readonly approximate: boolean
}

export const GRAM: Measure = Object.freeze({
  label: BaseUnit.GRAM,
  grams: 1,
  countable: false,
  approximate: false,
})

export function millilitre(density: number): Measure {
  return { label: BaseUnit.MILLILITRE, grams: density, countable: false, approximate: false }
}

export function servingMeasure(serving: Serving): Measure {
  return {
    label: serving.label,
    grams: serving.grams,
    countable: true,
    approximate: serving.approximate,
  }
}

const MAX_LABEL_LENGTH = 40
const MAX_SERVING_GRAMS = 10_000
/** Au-delà, une liste de portions devient un menu qu'on ne lit plus. */
export const MAX_SERVINGS = 8

/** Densités admises, en g/ml : de l'alcool pur (0,79) au miel (1,4), avec de la marge. */
const MIN_DENSITY = 0.5
const MAX_DENSITY = 2

export function createServing(
  label: string,
  grams: number,
  approximate = false,
): Result<Serving, InvalidFoodItemError> {
  const trimmed = label.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) {
    return err(new InvalidFoodItemError('Une portion doit porter un nom.'))
  }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    return err(
      new InvalidFoodItemError(`Le nom d’une portion dépasse ${MAX_LABEL_LENGTH} caractères.`),
    )
  }
  if (isBaseUnitLabel(trimmed)) {
    return err(new InvalidFoodItemError(`« ${trimmed} » est déjà l’unité de la fiche.`))
  }
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_SERVING_GRAMS) {
    return err(
      new InvalidFoodItemError(`La portion « ${trimmed} » doit peser entre 0 et ${MAX_SERVING_GRAMS} g.`),
    )
  }
  return ok({ label: trimmed, grams, approximate })
}

/**
 * Valide une liste de portions : chacune, puis l'ensemble — deux portions du
 * même nom rendraient la ligne de repas ambiguë à la relecture.
 */
export function validateServings(
  servings: readonly Serving[],
): Result<readonly Serving[], InvalidFoodItemError> {
  if (servings.length > MAX_SERVINGS) {
    return err(new InvalidFoodItemError(`Une fiche porte au plus ${MAX_SERVINGS} portions.`))
  }
  const valid: Serving[] = []
  const seen = new Set<string>()
  for (const serving of servings) {
    const created = createServing(serving.label, serving.grams, serving.approximate)
    if (!created.ok) return created
    const key = created.value.label.toLocaleLowerCase('fr')
    if (seen.has(key)) {
      return err(new InvalidFoodItemError(`La portion « ${created.value.label} » est en double.`))
    }
    seen.add(key)
    valid.push(created.value)
  }
  return ok(Object.freeze(valid))
}

export function isValidDensity(density: number): boolean {
  return Number.isFinite(density) && density >= MIN_DENSITY && density <= MAX_DENSITY
}

function isBaseUnitLabel(label: string): boolean {
  const lower = label.toLowerCase()
  return lower === BaseUnit.GRAM || lower === BaseUnit.MILLILITRE
}

/** Quantité exprimée dans une mesure : « 50 g » vaut 2 dans la mesure « tranche (25 g) ». */
export function amountIn(measure: Measure, grams: number): number {
  return grams / measure.grams
}

/** Pas de saisie et d'arrondi d'une mesure : la demi-portion, ou 5 g / 5 ml. */
export function stepOf(measure: Measure): number {
  return measure.countable ? 0.5 : 5
}

/**
 * Quantité, dans sa mesure, ajustée d'un facteur puis arrondie au pas de la
 * mesure, jamais nulle. À l'échelle 1, elle est reprise telle quelle :
 * l'arrondir ferait varier un repas que personne n'a demandé de changer.
 */
export function scaleAmount(amount: number, scale: number, measure: Measure): number {
  if (scale === 1) return amount
  const step = stepOf(measure)
  return Math.max(step, Math.round((amount * scale) / step) * step)
}

export function sameMeasure(a: Measure, b: Measure): boolean {
  return (
    a.label === b.label &&
    a.grams === b.grams &&
    a.countable === b.countable &&
    a.approximate === b.approximate
  )
}
