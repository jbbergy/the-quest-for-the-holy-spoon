// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import MacroGauge from '@/ui/MacroGauge.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import XpBar from '@/ui/XpBar.vue'

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
})

describe('XpBar', () => {
  const props = {
    level: 3,
    ratio: 0.4,
    xpIntoLevel: 40,
    xpToNextLevel: 60,
  }

  it('décrit la progression en toutes lettres', () => {
    const wrapper = mount(XpBar, { props })

    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('40')
    expect(bar.attributes('aria-valuetext')).toContain('Niveau 3')
    expect(bar.attributes('aria-valuetext')).toContain('60 XP avant le niveau suivant')
  })

  it('décrit le niveau maximum sans promettre une suite', () => {
    const wrapper = mount(XpBar, { props: { ...props, xpToNextLevel: null } })

    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toContain(
      'maximum atteint',
    )
    expect(wrapper.text()).toContain('Niveau maximum atteint')
  })

  it('joue la célébration puis acquitte le palier', async () => {
    const wrapper = mount(XpBar, { props, attachTo: document.body })

    await wrapper.setProps({ levelledUp: true })
    // La frise dure moins d'une seconde ; on lui laisse le temps de s'achever.
    await new Promise((resolve) => setTimeout(resolve, 900))

    expect(wrapper.emitted('celebrated')).toHaveLength(1)
    wrapper.unmount()
  })

  it('acquitte immédiatement le palier en mouvement réduit', async () => {
    stubMatchMedia(true)
    const wrapper = mount(XpBar, { props, attachTo: document.body })

    await wrapper.setProps({ levelledUp: true })
    await nextTick()

    // Le drapeau ne doit jamais rester armé : sinon l'animation serait rejouée
    // au prochain rendu.
    expect(wrapper.emitted('celebrated')).toHaveLength(1)
    wrapper.unmount()
  })

  it('annonce la montée de niveau aux lecteurs d’écran', async () => {
    const wrapper = mount(XpBar, { props: { ...props, levelledUp: true } })

    expect(wrapper.find('[aria-live="polite"]').text()).toContain('Niveau 3 atteint')
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
