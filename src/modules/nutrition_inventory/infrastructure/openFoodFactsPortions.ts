import type { FoodPortions } from '../domain/FoodItem'
import { BaseUnit, MAX_SERVINGS, type Serving } from '../domain/Measure'

import type { OpenFoodFactsProduct } from './openFoodFactsSchema'

/**
 * Traduction de la contenance et de la portion d'un produit Open Food Facts.
 *
 * Trois sources, par ordre de précision :
 * 1. la portion déclarée (`serving_quantity`), nommée d'après `serving_size`
 *    quand le texte le permet — « 25 g (1 tranche) » donne « tranche » ;
 * 2. l'unité d'un lot, lue dans `quantity` — « 6 x 125 g » donne « unité » ;
 * 3. l'emballage entier (`product_quantity`), s'il reste de taille à être
 *    mangé ou bu d'un coup.
 *
 * Tout est facultatif et la base est contributive : ce qui ne se comprend pas
 * est ignoré, jamais deviné. Une fiche sans portion reste saisissable en
 * grammes.
 */
export function portionsFromOpenFoodFacts(product: OpenFoodFactsProduct): FoodPortions {
  const unit = isVolume(product.serving_quantity_unit) || isVolume(product.product_quantity_unit)
    ? BaseUnit.MILLILITRE
    : BaseUnit.GRAM

  const servings: Serving[] = []
  const add = (label: string, grams: number | undefined): void => {
    if (grams === undefined || !(grams > 0) || grams > MAX_SERVING_GRAMS) return
    const rounded = Math.round(grams * 10) / 10
    if (servings.some((serving) => serving.grams === rounded || serving.label === label)) return
    servings.push({ label, grams: rounded, approximate: false })
  }

  const serving = inBaseUnit(product.serving_quantity, product.serving_quantity_unit)
  if (serving !== undefined) {
    const named = servingName(product.serving_size ?? '')
    add(named.label, serving / named.count)
  }

  const multipack = multipackUnit(product.quantity ?? '')
  if (multipack !== undefined) add('unité', multipack)

  const whole = inBaseUnit(product.product_quantity, product.product_quantity_unit)
  if (whole !== undefined && whole <= MAX_WHOLE_PACKAGE) {
    add(unit === BaseUnit.MILLILITRE ? 'bouteille' : 'paquet', whole)
  }

  // Les valeurs d'une boisson sont données pour 100 ml : le millilitre est déjà
  // le référentiel de la fiche, sa densité vaut donc 1 par construction.
  return { unit, density: 1, servings: servings.slice(0, MAX_SERVINGS) }
}

/** Au-delà, l'emballage (sac de riz, pack d'eau) ne se consomme pas d'une traite. */
const MAX_WHOLE_PACKAGE = 1000
const MAX_SERVING_GRAMS = 2000

function isVolume(unit: string | null | undefined): boolean {
  return unit != null && VOLUME_FACTOR[unit.trim().toLowerCase()] !== undefined
}

const VOLUME_FACTOR: Readonly<Record<string, number>> = { ml: 1, cl: 10, dl: 100, l: 1000 }
const MASS_FACTOR: Readonly<Record<string, number>> = { g: 1, mg: 0.001, kg: 1000 }

/** Grammes ou millilitres ; l'unité absente vaut le gramme, comme le fait Open Food Facts. */
function inBaseUnit(value: number | undefined, unit: string | null | undefined): number | undefined {
  if (value === undefined || !(value > 0)) return undefined
  const key = (unit ?? 'g').trim().toLowerCase()
  const factor = VOLUME_FACTOR[key] ?? MASS_FACTOR[key]
  return factor === undefined ? undefined : value * factor
}

/** « 6 x 125 g », « 4×100 ml » : la contenance d'une unité du lot. */
function multipackUnit(quantity: string): number | undefined {
  const match = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|mg|g|ml|cl|dl|l)\b/i.exec(quantity)
  if (match === null) return undefined
  const count = Number.parseInt(match[1] ?? '', 10)
  if (!(count > 1)) return undefined
  return inBaseUnit(Number.parseFloat((match[2] ?? '').replace(',', '.')), match[3])
}

/**
 * Nom de la portion dans le texte libre, et le nombre d'unités qu'elle compte.
 *
 * « 25 g (1 tranche) » → une « tranche » ; « 2 biscuits (25 g) » → deux
 * « biscuit », d'où 12,5 g le biscuit. Ce qui ne se lit pas s'appelle
 * « portion », qui ne ment jamais.
 */
export function servingName(text: string): { readonly label: string; readonly count: number } {
  const fallback = { label: 'portion', count: 1 }
  const stripped = text
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|mg|g|gr|grammes?|ml|cl|dl|l|oz)\b\.?/g, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped === '') return fallback

  const match = /^(?:(\d+(?:[.,]\d+)?|une?)\s+)?(.+)$/.exec(stripped)
  const words = match?.[2]?.trim() ?? ''
  const count = match?.[1] === undefined || /^une?$/.test(match[1])
    ? 1
    : Number.parseFloat(match[1].replace(',', '.'))
  if (!(count > 0) || /\d/.test(words) || words.length > 30) return fallback

  const label = translate(count > 1 ? singular(words) : words)
  return label === '' ? fallback : { label, count }
}

/** Le premier mot au singulier : « tranches de pain » → « tranche de pain ». */
function singular(words: string): string {
  const [first = '', ...rest] = words.split(' ')
  const single = first.length > 3 && first.endsWith('s') ? first.slice(0, -1) : first
  return [single, ...rest].join(' ')
}

/** La base est mondiale : les termes anglais les plus courants sont francisés. */
const TRANSLATIONS: Readonly<Record<string, string>> = {
  serving: 'portion',
  portion: 'portion',
  'portion individuelle': 'portion',
  slice: 'tranche',
  piece: 'pièce',
  cup: 'tasse',
  glass: 'verre',
  can: 'canette',
  bottle: 'bouteille',
  bar: 'barre',
  cookie: 'biscuit',
  tablespoon: 'c. à soupe',
  tbsp: 'c. à soupe',
  'cuillère à soupe': 'c. à soupe',
  'cuillerée à soupe': 'c. à soupe',
  teaspoon: 'c. à café',
  tsp: 'c. à café',
  'cuillère à café': 'c. à café',
  'cuillerée à café': 'c. à café',
}

function translate(words: string): string {
  return TRANSLATIONS[words] ?? words
}
