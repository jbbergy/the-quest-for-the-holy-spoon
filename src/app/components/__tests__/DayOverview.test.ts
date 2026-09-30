// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DayOverview from '@/app/components/DayOverview.vue'
import { addDays, type DayKey } from '@/core/day'
import { idFrom } from '@/core/identity'
import { type DailyIntake, RecentIntakeService } from '@/modules/planning/domain/RecentIntakeService'

const today = '2026-09-30' as DayKey

const needs = {
  playerId: idFrom<'PlayerId'>('player-1'),
  targetCalories: 2000,
  targetMacros: { proteinG: 90, carbsG: 260, fatG: 70 },
  referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 22, saltG: 5 },
  restrictions: [],
  allergens: [],
  history: [],
}

const base = {
  calories: 2000,
  proteinG: 90,
  carbsG: 260,
  fatG: 70,
  fiberG: 30,
  sugarsG: 100,
  saturatedFatG: 22,
  saltG: 5,
}

const intake = (daysAgo: number, calories: number): DailyIntake => ({
  day: addDays(today, -daysAgo),
  values: { ...base, calories },
})

function recentOf(history: readonly DailyIntake[]) {
  const result = RecentIntakeService.summarize(today, () => base, history)
  if (!result.ok) throw result.error
  return result.value
}

function mountDay(props: Record<string, unknown> = {}): VueWrapper {
  return mount(DayOverview, {
    props: {
      day: today,
      needs,
      totalCalories: 1240,
      totalMacros: { proteinG: 58, carbsG: 150, fatG: 44 },
      totalDetail: { fiberG: 12, sugarsG: 38, saturatedFatG: 12, saltG: 4.1 },
      recent: null,
      plannedCount: 0,
      consumedCount: 3,
      ...props,
    },
  })
}

/** Les espaces insécables des nombres français, ramenés à des espaces simples. */
const text = (wrapper: VueWrapper): string => wrapper.text().replace(/[\u00a0\u202f]/g, ' ')

beforeEach(() => {
  globalThis.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof matchMedia
})

describe('DayOverview', () => {
  it('dit ce qui reste à manger, en chiffres', () => {
    const wrapper = mountDay()

    expect(text(wrapper)).toContain('Il vous reste')
    expect(text(wrapper)).toContain('760 kcal')
  })

  it('dit un dépassement avec des mots, pas seulement un chiffre', () => {
    const wrapper = mountDay({ totalCalories: 2300 })

    expect(text(wrapper)).toContain('Au-delà du besoin')
    expect(text(wrapper)).toContain('+300 kcal')
  })

  it('annonce le besoin atteint sans chiffre à zéro', () => {
    expect(text(mountDay({ totalCalories: 2000 }))).toContain('Besoin atteint')
  })

  it('rappelle ce qui est encore prévu, repas nommés', () => {
    const wrapper = mountDay({ plannedCount: 1, plannedCalories: 540, plannedMeals: ['dîner'] })

    expect(text(wrapper)).toContain('Encore prévu : 540 kcal (dîner).')
  })

  it('écrit chaque nutriment face à son repère', () => {
    const figures = mountDay()
      .findAll('.day__macro-figure')
      .map((figure) => figure.text().replace(/\s+/g, ' '))

    expect(figures).toEqual(['58 / 90 g', '150 / 260 g', '44 / 70 g', '12 / 30 g'])
  })

  it('signale une limite presque atteinte, puis dépassée, en toutes lettres', () => {
    const wrapper = mountDay({ totalDetail: { fiberG: 12, sugarsG: 120, saturatedFatG: 12, saltG: 4.1 } })
    const limits = wrapper.findAll('.day__limit').map((limit) => limit.text().replace(/\s+/g, ' '))

    expect(limits.find((limit) => limit.startsWith('Sel'))).toContain('presque atteinte')
    expect(limits.find((limit) => limit.startsWith('Sucres'))).toContain('dépassée de 20 g')
    expect(limits.find((limit) => limit.startsWith('Graisses saturées'))).not.toContain('·')
  })

  it('donne chaque jour de la semaine aux lecteurs d’écran, jour sans repas compris', () => {
    const wrapper = mountDay({ recent: recentOf([intake(1, 1800), intake(3, 2100)]) })
    const spoken = wrapper.findAll('.chart ul li').map((item) => item.text().replace(/[\u00a0\u202f]/g, ' '))

    expect(spoken).toHaveLength(8)
    expect(spoken.at(-1)).toBe('Aujourd’hui, en cours : 1 240 kcal')
    expect(spoken.at(-2)).toMatch(/: 1 800 kcal$/)
    expect(spoken.at(-3)).toMatch(/: aucun repas mangé$/)
    expect(text(wrapper)).toContain('Moyenne : 1 950 kcal')
  })

  it('ne dessine pas de barre pour un jour sans repas mangé', () => {
    const wrapper = mountDay({ recent: recentOf([intake(1, 1800)]) })
    const bars = wrapper.findAll('.chart__bar')

    expect(bars).toHaveLength(8)
    expect(bars[5]!.attributes('style')).toContain('height: 0')
    expect(bars[6]!.attributes('style')).not.toContain('height: 0')
    expect(wrapper.find('.chart__plot').attributes('aria-hidden')).toBe('true')
  })
})
