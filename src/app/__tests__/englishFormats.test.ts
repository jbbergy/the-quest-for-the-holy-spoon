// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import { adviceFor } from '@/app/advice'
import { MEAL_OPTIONS, formatDay, formatWeek, mealLabel } from '@/app/mealLabels'
import { formatPortion, formatWeight, pluralize } from '@/app/portionFormat'
import { dietLabel } from '@/app/profileOptions'
import { formatShoppingQuantity } from '@/app/shopping/shoppingFormat'
import { formatDay as formatShortDay, nameParams } from '@/app/views/householdFormat'
import { GLOSSARY } from '@/app/glossary'
import { tagLabel } from '@/app/foodTags'
import { setCurrentLocale, t } from '@/i18n'
import { Diet, MealType } from '@/modules/nutrition_inventory/application'
import { CompletionStatus, type IdealFoodProfile } from '@/modules/planning/application'
import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import RichText from '@/ui/RichText.vue'
import { parseDayKey } from '@/core/day'

const slice = { label: 'slice', grams: 25, countable: true, approximate: false }
const glass = { label: 'glass', grams: 206, countable: true, approximate: true }

beforeEach(() => setCurrentLocale('en'))
afterEach(() => setCurrentLocale('fr'))

describe('quantités en anglais', () => {
  it('accorde dès que la quantité n’est pas 1', () => {
    expect(formatPortion(1, slice)).toBe('1 slice')
    expect(formatPortion(1.5, slice)).toBe('1½ slices')
    expect(formatPortion(2, slice)).toBe('2 slices')
    expect(formatPortion(0.5, slice)).toBe('½ slices')
  })

  it.each([
    ['slice', 'slices'],
    ['glass', 'glasses'],
    ['berry', 'berries'],
    ['tbsp.', 'tbsp.'],
    ['slice of cake', 'slices of cake'],
    ['morceau', 'morceaux'],
  ])('%p → %p', (label, plural) => {
    expect(pluralize(label)).toBe(plural)
  })

  it('dit « about » pour une mesure moyenne', () => {
    expect(formatWeight(206, glass, { label: 'ml', grams: 1.03, countable: false, approximate: false })).toBe('about 200 ml')
  })

  it('écrit les décimales à l’anglaise', () => {
    expect(formatPortion(152.4, { label: 'g', grams: 1, countable: false, approximate: false })).toBe('152 g')
    expect(
      formatShoppingQuantity({
        id: 'i',
        name: 'x',
        foodItemId: 'f',
        amount: 1230,
        grams: 1230,
        unit: { label: 'g', grams: 1, countable: false, approximate: false },
        quantityText: null,
        checked: false,
        neededBy: [],
      } as never),
    ).toBe('1.3 kg')
  })
})

describe('libellés en anglais', () => {
  it('traduit les repas, les régimes, les marqueurs et le lexique', () => {
    expect(MEAL_OPTIONS.map((option) => option.label)).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner'])
    expect(mealLabel(MealType.DINNER)).toBe('Dinner')
    expect(dietLabel(Diet.GLUTEN_FREE)).toBe('Gluten-free')
    expect(tagLabel(FoodTag.CONTAINS_MILK)).toBe('Contains milk')
    expect(GLOSSARY.barcode).toContain('The number written under the bars')
  })

  it('écrit les dates à l’anglaise', () => {
    const day = parseDayKey('2026-09-23')!
    expect(formatDay(day)).toBe('Wednesday 23 September')
    expect(formatWeek(parseDayKey('2026-09-21')!, parseDayKey('2026-09-27')!)).toBe('21 – 27 September')
    expect(formatShortDay(new Date(2026, 9, 8))).toBe('8 October')
  })

  it('emploie le possessif anglais pour une personne, l’élision pour le français', () => {
    expect(t('week.member.pageTitle', nameParams('Alex'))).toBe('Alex’s day')
    setCurrentLocale('fr')
    expect(t('week.member.pageTitle', nameParams('Alex'))).toBe('Journée d’Alex')
    expect(t('week.member.pageTitle', nameParams('Camille'))).toBe('Journée de Camille')
  })
})

describe('conseil du jour en anglais', () => {
  const profile = (overrides: Partial<IdealFoodProfile> = {}): IdealFoodProfile => ({
    status: CompletionStatus.ON_TRACK,
    remainingCalories: 1890,
    remainingMacros: { proteinG: 87, carbsG: 193, fatG: 86 },
    remainingFiberG: 8.4,
    idealRatios: { protein: 0.2, carbs: 0.45, fat: 0.35 },
    completionRatio: 0.18,
    excessCalories: 0,
    ...overrides,
  })

  it('reste dans la langue, exemples compris, et respecte le régime', () => {
    expect(adviceFor(profile(), [Diet.GLUTEN_FREE])).toEqual([
      'You have 1,890 kcal left for today.',
      'You are mostly missing carbohydrates: 193 g.',
      'For example: rice, potatoes, fruit.',
      'You are also missing 8 g of fibre.',
      'For example: vegetables, fruit, pulses.',
    ])
  })
})

describe('composants en anglais', () => {
  it('ErrorNotice traduit le code de l’erreur, ou retombe sur un message général', () => {
    const known = mount(ErrorNotice, { props: { error: { kind: 'domain', code: 'WEAK_PASSWORD', message: '' } } })
    expect(known.text()).toContain('This password is too short')

    const unknown = mount(ErrorNotice, { props: { error: { kind: 'domain', code: 'NOPE', message: '' } } })
    expect(unknown.text()).toContain('Something went wrong')
  })

  it('RichText met en gras et place les emplacements où la langue les veut', () => {
    // Le composant a plusieurs racines : `text()` de Vue Test Utils rogne chacune,
    // ce qui avalerait les espaces à leurs jonctions. On lit donc le conteneur.
    const host = document.createElement('div')
    const sent = mount(RichText, {
      props: { path: 'account.forgot.sent' },
      slots: { email: () => h('strong', 'camille@example.com') },
      attachTo: host,
    })

    expect(host.textContent).toBe(
      'If an account exists with the address camille@example.com, we have just sent a link to it. It works for 1 hour. Also check your spam folder.',
    )
    expect(sent.find('strong').text()).toBe('camille@example.com')

    const boldHost = document.createElement('div')
    const bold = mount(RichText, { props: { path: 'calculations.foods.per100' }, attachTo: boldHost })
    expect(bold.find('strong').text()).toBe('per 100 g')
    expect(boldHost.textContent).toBe(
      'Figures are given per 100 g. For a branded liquid, it is per 100 ml.',
    )
  })
})
