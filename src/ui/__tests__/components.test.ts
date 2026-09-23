// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import MacroGauge from '@/ui/MacroGauge.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

/**
 * `matchMedia` n'existe pas dans happy-dom : sans lui, `useReducedMotion` et le
 * thème échoueraient. La valeur est pilotée par test pour couvrir les deux
 * branches — avec et sans mouvement réduit.
 */
function stubMatchMedia(reducedMotion: boolean): void {
  globalThis.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof matchMedia
}

beforeEach(() => {
  stubMatchMedia(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BaseButton', () => {
  it('rend un vrai bouton, pas un div cliquable', () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Valider' } })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.text()).toContain('Valider')
  })

  it('reste focalisable pendant le chargement', () => {
    // `aria-disabled` plutôt que `disabled` : désactiver l'élément le sortirait
    // de l'ordre de tabulation et déplacerait le focus sans prévenir.
    const wrapper = mount(BaseButton, { props: { loading: true } })

    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.attributes('disabled')).toBeUndefined()
  })

  it('n’émet pas de clic quand il est inerte', async () => {
    const wrapper = mount(BaseButton, { props: { loading: true } })

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('émet un clic en fonctionnement normal', async () => {
    const wrapper = mount(BaseButton)

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})

describe('BaseField', () => {
  it('lie l’étiquette au champ', () => {
    const wrapper = mount(BaseField, { props: { label: 'Poids', modelValue: 80 } })

    const id = wrapper.find('input').attributes('id')
    expect(id).toBeTruthy()
    expect(wrapper.find('label').attributes('for')).toBe(id)
  })

  it('rattache l’erreur au champ par aria-describedby', () => {
    // Une erreur affichée mais non rattachée n'existe pas pour un lecteur
    // d'écran : c'est l'échec le plus courant du critère 3.3.1.
    const wrapper = mount(BaseField, {
      props: { label: 'Poids', modelValue: 5, error: 'Valeur hors bornes' },
    })

    const describedBy = wrapper.find('input').attributes('aria-describedby')
    const errorId = wrapper.find('[role="alert"]').attributes('id')

    expect(describedBy).toBeTruthy()
    expect(describedBy?.split(' ')).toContain(errorId)
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('rattache aussi l’indication d’aide', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Code', modelValue: '', hint: '8 à 14 chiffres.' },
    })

    const describedBy = wrapper.find('input').attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.text()).toContain('8 à 14 chiffres.')
  })

  it('n’annonce aucune description quand il n’y en a pas', () => {
    const wrapper = mount(BaseField, { props: { label: 'Nom', modelValue: '' } })

    expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('annonce le caractère obligatoire autrement que par l’astérisque', () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Nom', modelValue: '', required: true },
    })

    expect(wrapper.find('.sr-only').text()).toContain('obligatoire')
  })

  it('émet un nombre pour un champ numérique', async () => {
    const wrapper = mount(BaseField, {
      props: { label: 'Poids', modelValue: 80, type: 'number' },
    })

    const input = wrapper.find('input').element as HTMLInputElement
    input.value = '90'
    await wrapper.find('input').trigger('input')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([90])
  })
})

describe('MacroGauge', () => {
  it('expose une barre de progression complète pour les lecteurs d’écran', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Protéines', value: 93, target: 150 },
    })

    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('93')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('150')
  })

  it('annonce une valeur en toutes lettres, pas un pourcentage', () => {
    // « 62 pour cent » est exact mais inexploitable ; « 93 sur 150 grammes » l'est.
    const wrapper = mount(MacroGauge, {
      props: { label: 'Protéines', value: 93, target: 150 },
    })

    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Protéines : 93 sur 150 g',
    )
  })

  it('plafonne le remplissage et signale le dépassement par la couleur', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Calories', value: 3000, target: 2000, unit: 'kcal' },
    })

    expect(wrapper.classes()).toContain('gauge--exceeded')
    expect(wrapper.find('.gauge__fill').attributes('style')).toContain('100.0%')
  })

  it('ne divise pas par zéro sur une cible nulle', () => {
    const wrapper = mount(MacroGauge, { props: { label: 'X', value: 10, target: 0 } })

    expect(wrapper.find('.gauge__fill').attributes('style')).toContain('0.0%')
  })

  it('interpole vers la nouvelle valeur au lieu d’y sauter', async () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Protéines', value: 0, target: 150 },
    })

    await wrapper.setProps({ value: 150 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const midway = wrapper.find('.gauge__fill').attributes('style')

    await new Promise((resolve) => setTimeout(resolve, 900))
    const settled = wrapper.find('.gauge__fill').attributes('style')

    // C'est la réassignation de la valeur — rendue possible par l'immutabilité
    // du domaine — qui déclenche l'interpolation.
    expect(midway).not.toContain('100.0%')
    expect(settled).toContain('100.0%')
  })

  it('distingue un plafond d’une cible pour les lecteurs d’écran', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Sel', value: 4, target: 5, mode: 'limit' as const },
    })

    // Sans « au maximum », un lecteur d'écran annoncerait « 4 sur 5 grammes »
    // comme une progression : quelqu'un qui ne voit pas la couleur croirait
    // devoir atteindre sa limite de sel (critère 1.4.1).
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Sel : 4 sur 5 g au maximum',
    )
    expect(wrapper.text()).toContain('max')
  })

  it('reste sourde tant qu’un plafond n’est pas franchi', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Sucres', value: 40, target: 100, mode: 'limit' as const },
    })

    expect(wrapper.classes()).toContain('gauge--limit')
    expect(wrapper.classes()).not.toContain('gauge--exceeded')
  })

  it('signale le dépassement d’un plafond comme celui d’une cible', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Sel', value: 7, target: 5, mode: 'limit' as const },
    })

    expect(wrapper.classes()).toContain('gauge--exceeded')
  })

  it('reste en mode cible par défaut', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Fibres', value: 12, target: 30, tone: 'fiber' as const },
    })

    expect(wrapper.classes()).toContain('gauge--target')
    expect(wrapper.classes()).toContain('gauge--fiber')
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Fibres : 12 sur 30 g',
    )
  })

  it('affiche la valeur finale sans animation en mouvement réduit', async () => {
    stubMatchMedia(true)
    const wrapper = mount(MacroGauge, {
      props: { label: 'Protéines', value: 0, target: 150 },
    })

    await wrapper.setProps({ value: 120 })
    await nextTick()

    // GSAP anime en JavaScript et ignore les règles CSS : sans cette bascule,
    // la jauge continuerait de bouger chez qui a demandé à l'éviter.
    expect(wrapper.find('.gauge__fill').attributes('style')).toContain('80.0%')
  })

  it('dit « au minimum » pour un minimum à atteindre', () => {
    const wrapper = mount(MacroGauge, {
      props: { label: 'Fibres', value: 12, target: 30, mode: 'floor' as const },
    })

    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Fibres : 12 sur 30 g au minimum',
    )
    expect(wrapper.find('.gauge__target').text()).toContain('min')
  })

  describe('moyenne des jours précédents', () => {
    const calories = (average: number | null, extra: Record<string, unknown> = {}) =>
      mount(MacroGauge, {
        props: { label: 'Calories', unit: 'kcal', value: 1000, target: 2000, average, ...extra },
      })

    it('ne montre rien sans moyenne', () => {
      const wrapper = calories(null)

      expect(wrapper.find('.gauge__average').exists()).toBe(false)
      expect(wrapper.find('.gauge__marker').exists()).toBe(false)
      expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
        'Calories : 1000 sur 2000 kcal',
      )
    })

    it('chiffre la moyenne, nomme le déficit et place le trait', () => {
      const wrapper = calories(1700)

      expect(wrapper.find('.gauge__average').text()).toMatch(
        /Moyenne sur 7 jours : 1700 kcal\s+· déficit moyen de 300 kcal/,
      )
      expect(wrapper.find('.gauge__marker').attributes('style')).toContain('left: 85.0%')
    })

    it('ne change pas l’objectif du jour', () => {
      const bar = calories(1700).find('[role="progressbar"]')

      expect(bar.attributes('aria-valuemax')).toBe('2000')
    })

    it('annonce la moyenne aux lecteurs d’écran, en mots', () => {
      expect(
        calories(2300, { averageDays: 3 }).find('[role="progressbar"]').attributes('aria-valuetext'),
      ).toBe(
        'Calories : 1000 sur 2000 kcal. Moyenne sur 3 jours renseignés : 2300 kcal ' +
          'par jour, excès moyen de 300 kcal',
      )
    })

    it('précise quand un seul jour est renseigné', () => {
      expect(calories(1900, { averageDays: 1 }).find('.gauge__average').text()).toContain(
        'Moyenne sur un seul jour renseigné',
      )
    })

    it('garde le trait au bout de la barre quand la moyenne dépasse le repère', () => {
      expect(calories(2600).find('.gauge__marker').attributes('style')).toContain('left: 100.0%')
    })

    it('tait un écart sous le centième du repère', () => {
      expect(calories(1990).find('.gauge__average').text()).toContain('au niveau du besoin')
    })

    it('le trait est décoratif : l’information est dans le texte', () => {
      expect(calories(1700).find('.gauge__swatch').attributes('aria-hidden')).toBe('true')
    })

    it('lit un plafond dans le bon sens, au dixième de gramme', () => {
      const salt = (average: number) =>
        mount(MacroGauge, {
          props: { label: 'Sel', value: 2, target: 5, mode: 'limit' as const, average },
        }).find('.gauge__average')

      expect(salt(6.24).text()).toContain('6,2 g')
      expect(salt(6.24).text()).toContain('excès moyen de 1,2 g')
      expect(salt(3).text()).toContain('sous le plafond')
    })

    it('ne parle jamais d’excès de fibres', () => {
      const fiber = (average: number) =>
        mount(MacroGauge, {
          props: { label: 'Fibres', value: 10, target: 30, mode: 'floor' as const, average },
        }).find('.gauge__average')

      expect(fiber(40).text()).toContain('minimum atteint')
      expect(fiber(22).text()).toContain('déficit moyen de 8 g')
    })
  })
})

describe('MealConsumedToggle', () => {
  const mountToggle = (consumedAt: string | null) =>
    mount(MealConsumedToggle, { props: { consumedAt, mealLabel: 'Déjeuner' } })

  it('annonce l’état par aria-pressed, pas par un changement de libellé', () => {
    const planned = mountToggle(null)
    const eaten = mountToggle('2026-04-10T12:45:00.000Z')

    expect(planned.get('button').attributes('aria-pressed')).toBe('false')
    expect(eaten.get('button').attributes('aria-pressed')).toBe('true')
    // Le nom accessible reste stable d'un état à l'autre : c'est `aria-pressed`
    // qui porte l'information, pas un libellé qui changerait sous le lecteur.
    expect(planned.get('button').text()).toContain('Pris')
    expect(eaten.get('button').text()).toContain('Pris')
  })

  it('distingue les boutons d’une liste par le nom du repas', () => {
    // Quatre repas dans une journée produiraient sinon quatre boutons « Pris »
    // rigoureusement identiques au lecteur d'écran.
    expect(mountToggle(null).get('button').text()).toContain('Déjeuner')
  })

  it('demande l’état inverse de l’état courant', async () => {
    const planned = mountToggle(null)
    const eaten = mountToggle('2026-04-10T12:45:00.000Z')

    await planned.get('button').trigger('click')
    await eaten.get('button').trigger('click')

    expect(planned.emitted('toggle')?.[0]).toEqual([true])
    expect(eaten.emitted('toggle')?.[0]).toEqual([false])
  })

  it('affiche l’heure une fois le repas pris, et sinon le dit', () => {
    expect(mountToggle(null).text()).toContain('Pas encore compté')
    expect(mountToggle('2026-04-10T12:45:00.000Z').text()).toMatch(/à \d{2}:\d{2}/)
  })

  it('ne casse pas sur une date illisible', () => {
    // Un enregistrement corrompu ne doit pas faire disparaître la commande.
    const wrapper = mountToggle('pas une date')

    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Pas encore compté')
  })
})
