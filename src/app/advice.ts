import { numberFormat, t } from '@/i18n'
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
  /** Clé de traduction du nom de l'aliment. */
  readonly word: string
  /** Régimes auxquels cet exemple ne convient pas. */
  readonly unsuitableFor: readonly Diet[]
}

const MEAT_FREE = [Diet.VEGETARIAN, Diet.VEGAN, Diet.PESCATARIAN] as const
const FISH_FREE = [Diet.VEGETARIAN, Diet.VEGAN] as const
const MILK_FREE = [Diet.VEGAN, Diet.LACTOSE_FREE] as const

const EXAMPLES: Readonly<Record<Macro | 'fiber', readonly Example[]>> = {
  protein: [
    { word: 'advice.example.meat', unsuitableFor: MEAT_FREE },
    { word: 'advice.example.fish', unsuitableFor: FISH_FREE },
    { word: 'advice.example.eggs', unsuitableFor: [Diet.VEGAN] },
    { word: 'advice.example.pulses', unsuitableFor: [] },
    { word: 'advice.example.tofu', unsuitableFor: [] },
    { word: 'advice.example.yogurt', unsuitableFor: MILK_FREE },
  ],
  carbs: [
    { word: 'advice.example.bread', unsuitableFor: [Diet.GLUTEN_FREE] },
    { word: 'advice.example.pasta', unsuitableFor: [Diet.GLUTEN_FREE] },
    { word: 'advice.example.rice', unsuitableFor: [] },
    { word: 'advice.example.potatoes', unsuitableFor: [] },
    { word: 'advice.example.fruit', unsuitableFor: [] },
  ],
  fat: [
    { word: 'advice.example.oliveOil', unsuitableFor: [] },
    { word: 'advice.example.nuts', unsuitableFor: [] },
    { word: 'advice.example.avocado', unsuitableFor: [] },
    { word: 'advice.example.cheese', unsuitableFor: MILK_FREE },
  ],
  fiber: [
    { word: 'advice.example.vegetables', unsuitableFor: [] },
    { word: 'advice.example.fruit', unsuitableFor: [] },
    { word: 'advice.example.pulses', unsuitableFor: [] },
    { word: 'advice.example.wholemealBread', unsuitableFor: [Diet.GLUTEN_FREE] },
  ],
}

const NAMES: Readonly<Record<Macro, string>> = {
  protein: 'advice.macro.protein',
  carbs: 'advice.macro.carbs',
  fat: 'advice.macro.fat',
}

const GRAMS: Readonly<Record<Macro, 'proteinG' | 'carbsG' | 'fatG'>> = {
  protein: 'proteinG',
  carbs: 'carbsG',
  fat: 'fatG',
}

/** Sous ces seuils, un manque ne vaut pas une phrase. */
const MIN_GRAMS = 5
const MIN_FIBER_G = 1

const whole = { format: (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value) }

function examplesFor(kind: Macro | 'fiber', diets: readonly Diet[]): string {
  const words = EXAMPLES[kind]
    .filter((example) => !example.unsuitableFor.some((diet) => diets.includes(diet)))
    .map((example) => t(example.word))
  return t('advice.forExample', { examples: words.join(', ') })
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
      t('advice.exceeded', { kcal: whole.format(profile.excessCalories) }),
      t('advice.exceededNote'),
    )
  } else if (profile.status === CompletionStatus.COMPLETE) {
    lines.push(t('advice.complete'))
  } else {
    lines.push(t('advice.remaining', { kcal: whole.format(profile.remainingCalories) }))
    const priority = priorityOf(profile)
    if (priority !== null) {
      const grams = whole.format(profile.remainingMacros[GRAMS[priority]])
      lines.push(t('advice.missingMacro', { name: t(NAMES[priority]), grams }))
      lines.push(examplesFor(priority, diets))
      missesMacro = true
    }
  }

  const fiber = Math.round(profile.remainingFiberG)
  if (fiber >= MIN_FIBER_G) {
    const also = missesMacro ? t('advice.also') : t('advice.stillMissing')
    lines.push(t('advice.missingFiber', { also, grams: fiber }), examplesFor('fiber', diets))
  }
  return lines
}
