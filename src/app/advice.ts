import { Diet } from '@/modules/nutrition_inventory/application'
import { CompletionStatus, type IdealFoodProfile } from '@/modules/planning/application'

/**
 * Le conseil du jour, en phrases courtes.
 *
 * Une idée par phrase, un seul nutriment mis en avant — le plus en retard — et
 * des exemples d'aliments pour le trouver. L'ancienne version disait
 * « privilégiez les glucides » puis citait trois manques à la fois : on ne
 * savait plus lequel compte.
 *
 * Le ton décrit, il ne juge pas : dépasser son besoin un jour n'est pas une
 * faute, c'est la moyenne sur plusieurs jours qui compte.
 */

type Macro = 'protein' | 'carbs' | 'fat'

interface Example {
  readonly word: string
  /** Régimes auxquels cet exemple ne convient pas. */
  readonly unsuitableFor: readonly Diet[]
}

const MEAT_FREE = [Diet.VEGETARIAN, Diet.VEGAN, Diet.PESCATARIAN] as const
const FISH_FREE = [Diet.VEGETARIAN, Diet.VEGAN] as const
const MILK_FREE = [Diet.VEGAN, Diet.LACTOSE_FREE] as const

const EXAMPLES: Readonly<Record<Macro | 'fiber', readonly Example[]>> = {
  protein: [
    { word: 'viande', unsuitableFor: MEAT_FREE },
    { word: 'poisson', unsuitableFor: FISH_FREE },
    { word: 'œufs', unsuitableFor: [Diet.VEGAN] },
    { word: 'légumes secs', unsuitableFor: [] },
    { word: 'tofu', unsuitableFor: [] },
    { word: 'yaourt', unsuitableFor: MILK_FREE },
  ],
  carbs: [
    { word: 'pain', unsuitableFor: [Diet.GLUTEN_FREE] },
    { word: 'pâtes', unsuitableFor: [Diet.GLUTEN_FREE] },
    { word: 'riz', unsuitableFor: [] },
    { word: 'pommes de terre', unsuitableFor: [] },
    { word: 'fruits', unsuitableFor: [] },
  ],
  fat: [
    { word: 'huile d’olive', unsuitableFor: [] },
    { word: 'noix', unsuitableFor: [] },
    { word: 'avocat', unsuitableFor: [] },
    { word: 'fromage', unsuitableFor: MILK_FREE },
  ],
  fiber: [
    { word: 'légumes', unsuitableFor: [] },
    { word: 'fruits', unsuitableFor: [] },
    { word: 'légumes secs', unsuitableFor: [] },
    { word: 'pain complet', unsuitableFor: [Diet.GLUTEN_FREE] },
  ],
}

const NAMES: Readonly<Record<Macro, string>> = {
  protein: 'protéines',
  carbs: 'glucides',
  fat: 'lipides',
}

const GRAMS: Readonly<Record<Macro, 'proteinG' | 'carbsG' | 'fatG'>> = {
  protein: 'proteinG',
  carbs: 'carbsG',
  fat: 'fatG',
}

/** Sous ces seuils, un manque ne vaut pas une phrase. */
const MIN_GRAMS = 5
const MIN_FIBER_G = 1

const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function examplesFor(kind: Macro | 'fiber', diets: readonly Diet[]): string {
  const words = EXAMPLES[kind]
    .filter((example) => !example.unsuitableFor.some((diet) => diets.includes(diet)))
    .map((example) => example.word)
  return `Par exemple : ${words.join(', ')}.`
}

/** Le nutriment le plus en retard, en part des calories qui restent. `null` : aucun. */
function priorityOf(profile: IdealFoodProfile): Macro | null {
  const ratios = profile.idealRatios
  const ranked = (['protein', 'carbs', 'fat'] as const)
    .map((macro) => ({ macro, share: ratios[macro] }))
    .sort((a, b) => b.share - a.share)
  const top = ranked[0]
  if (top === undefined || top.share <= 0) return null
  return profile.remainingMacros[GRAMS[top.macro]] >= MIN_GRAMS ? top.macro : null
}

export function adviceFor(profile: IdealFoodProfile, diets: readonly Diet[]): string[] {
  const lines: string[] = []
  let missesMacro = false

  if (profile.status === CompletionStatus.EXCEEDED) {
    lines.push(
      `Vous avez mangé ${whole.format(profile.excessCalories)} kcal de plus que votre besoin.`,
      'Ce n’est pas grave. Ce qui compte, c’est la moyenne sur plusieurs jours.',
    )
  } else if (profile.status === CompletionStatus.COMPLETE) {
    lines.push('Vous avez mangé ce dont vous avez besoin aujourd’hui.')
  } else {
    lines.push(`Il vous reste ${whole.format(profile.remainingCalories)} kcal pour aujourd’hui.`)
    const priority = priorityOf(profile)
    if (priority !== null) {
      const grams = whole.format(profile.remainingMacros[GRAMS[priority]])
      lines.push(`Il vous manque surtout des ${NAMES[priority]} : ${grams} g.`)
      lines.push(examplesFor(priority, diets))
      missesMacro = true
    }
  }

  const fiber = Math.round(profile.remainingFiberG)
  if (fiber >= MIN_FIBER_G) {
    const also = missesMacro ? 'aussi' : 'encore'
    lines.push(`Il vous manque ${also} ${fiber} g de fibres.`, examplesFor('fiber', diets))
  }
  return lines
}
