import { currentLocale, numberFormat, t } from '@/i18n'
import { GRAM, type Measure } from '@/modules/nutrition_inventory/domain/Measure'

/**
 * Mise en mots des quantités : « 2 tranches », « 1½ œuf », « 150 ml ».
 *
 * Présentation pure : le domaine ne connaît que des grammes et des mesures, la
 * grammaire française reste ici.
 */

const FRACTIONS: Readonly<Record<number, string>> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

const number = { format: (value: number): string => numberFormat({ maximumFractionDigits: 1 }).format(value) }

/** « ½ », « 1½ », « 2 », et « 2,3 » pour ce qui ne tombe pas sur un quart. */
export function formatAmount(amount: number): string {
  const whole = Math.floor(amount)
  const fraction = FRACTIONS[Math.round((amount - whole) * 100) / 100]
  if (fraction !== undefined) return whole === 0 ? fraction : `${whole}${fraction}`
  return number.format(amount)
}

/**
 * Mots qui ne s'accordent pas : au-delà, un groupe nominal s'arrête. « part de
 * gâteau » devient « parts de gâteau », « c. à soupe » ne bouge pas.
 */
const STOP_WORDS = new Set([
  // français
  'de',
  'd’',
  "d'",
  'du',
  'des',
  'à',
  'au',
  'aux',
  'en',
  'pour',
  'sans',
  'avec',
  // anglais : « slice of cake » devient « slices of cake »
  'of',
  'with',
  'without',
  'in',
  'on',
  'for',
  'and',
  'to',
  'from',
])

/**
 * Pluriel d'un nom de portion, par les règles régulières : suffisant pour des
 * noms courts comme « tranche », « bol », « morceau » ou « petit-suisse ».
 */
export function pluralize(label: string): string {
  const words = label.split(' ')
  let stopped = false
  return words
    .map((word) => {
      if (stopped || STOP_WORDS.has(word) || word.startsWith('(')) {
        stopped = true
        return word
      }
      return pluralWord(word)
    })
    .join(' ')
}

function pluralWord(word: string): string {
  if (word.includes('-')) return word.split('-').map(pluralWord).join('-')
  if (word.length < 2 || word.endsWith('.')) return word
  return currentLocale() === 'en' ? englishPlural(word) : frenchPlural(word)
}

function frenchPlural(word: string): string {
  if (/[sxz]$/.test(word)) return word
  if (/(eau|eu)$/.test(word)) return `${word}x`
  return `${word}s`
}

/**
 * Pluriel anglais régulier. « eau » garde le « x » : le catalogue public est en
 * français, et « morceau » s'y accorde « morceaux » quelle que soit la langue
 * de l'écran.
 */
function englishPlural(word: string): string {
  if (/eau$/.test(word)) return `${word}x`
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  return `${word}s`
}

/**
 * Une quantité dans sa mesure. Le pluriel commence à 2 en français (« 1½
 * tranche », « 2 tranches »), dès que ce n'est pas 1 en anglais (« 1½ slices »).
 */
export function formatPortion(amount: number, measure: Measure): string {
  if (!measure.countable) return `${number.format(Math.round(amount))} ${measure.label}`
  return `${formatAmount(amount)} ${measureWord(measure, amount)}`
}

/** Le nom de la mesure, accordé à la quantité : « tranche » ou « tranches ». */
export function measureWord(measure: Measure, amount: number): string {
  if (!measure.countable) return measure.label
  const plural = currentLocale() === 'en' ? amount !== 1 : amount >= 2
  return plural ? pluralize(measure.label) : measure.label
}

/**
 * Poids ou volume d'une quantité, dans l'unité de base de la fiche : « 50 g »,
 * « 200 ml », précédé de « environ » quand la mesure n'est qu'une moyenne — en
 * toutes lettres : « ≈ » ne se lit pas pour tout le monde.
 */
export function formatWeight(grams: number, measure: Measure, base: Measure = GRAM): string {
  const value = number.format(Math.round(grams / base.grams))
  const weight = `${value} ${base.label}`
  return measure.approximate ? t('labels.portion.approximate', { weight }) : weight
}

/** Nom d'une mesure dans un choix : « g », « tranche (25 g) », « verre (environ 200 ml) ». */
export function measureOptionLabel(measure: Measure, base: Measure = GRAM): string {
  if (!measure.countable) return measure.label
  return `${measure.label} (${formatWeight(measure.grams, measure, base)})`
}

/** Base des valeurs nutritionnelles d'une fiche : « 100 ml » seulement si elle y est exprimée. */
export function per100Label(food: { readonly unit: string; readonly density: number }): string {
  return food.unit === 'ml' && food.density === 1 ? '100 ml' : '100 g'
}
