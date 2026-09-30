// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import InfoTip from '@/ui/InfoTip.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import RingGauge from '@/ui/RingGauge.vue'

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

  it('reste focalisable quand il est désactivé, sans rien émettre', async () => {
    // Le bouton désactivé garde sa place dans la tabulation : la raison écrite
    // à côté (« Ajoutez au moins un aliment ») doit pouvoir être atteinte.
    const wrapper = mount(BaseButton, { props: { disabled: true } })

    await wrapper.trigger('click')

    expect(wrapper.attributes('disabled')).toBeUndefined()
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('n’envoie pas le formulaire quand il est désactivé', () => {
    // Un `submit` inerte doit bloquer l'envoi par défaut, pas seulement son
    // propre événement : sinon le formulaire partirait quand même.
    const wrapper = mount(BaseButton, { props: { type: 'submit', disabled: true } })
    const event = new MouseEvent('click', { cancelable: true })

    wrapper.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})

describe('AppIcon', () => {
  it('reste décorative : masquée aux lecteurs d’écran et hors du focus', () => {
    const wrapper = mount(AppIcon, { props: { name: 'check' } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('focusable')).toBe('false')
    expect(wrapper.html()).toContain('M5 12.5l4.5 4.5L19 7.5')
  })

  it('suit la taille du texte, sauf taille explicite', () => {
    expect(mount(AppIcon, { props: { name: 'plus' } }).attributes('width')).toBe('1.25em')
    expect(mount(AppIcon, { props: { name: 'plus', size: 2 } }).attributes('height')).toBe('2em')
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

describe('RingGauge', () => {
  const ring = (props: Record<string, unknown>) =>
    mount(RingGauge, { props: { label: 'Protéines', value: 93, target: 150, ...props } })

  it('expose une barre de progression complète pour les lecteurs d’écran', () => {
    const bar = ring({}).find('[role="progressbar"]')

    expect(bar.attributes('aria-valuenow')).toBe('93')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('150')
    expect(bar.attributes('aria-label')).toBe('Protéines')
  })

  it('annonce la valeur et l’état en toutes lettres, pas un pourcentage', () => {
    expect(ring({}).find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Protéines : 93 g, sur 150 g. Encore 57 g.',
    )
  })

  it('dit l’état en mots, sous l’anneau', () => {
    expect(ring({ value: 150 }).text()).toContain('Besoin atteint')
    expect(ring({ value: 170 }).text()).toContain('20 g de plus que le besoin')
  })

  it('distingue une limite d’un besoin', () => {
    const salt = ring({ label: 'Sel', value: 4, target: 5, mode: 'limit' })

    // Sans « limite », un lecteur d'écran présenterait 4 sur 5 g comme une
    // progression à poursuivre (critère 1.4.1).
    expect(salt.find('[role="progressbar"]').attributes('aria-valuetext')).toBe(
      'Sel : 4 g, limite 5 g. Sous la limite.',
    )
    expect(salt.classes()).not.toContain('ring--exceeded')
  })

  it('signale une limite franchie par la couleur, un signe et des mots', () => {
    const salt = ring({ label: 'Sel', value: 6.2, target: 5, mode: 'limit' })

    expect(salt.classes()).toContain('ring--exceeded')
    expect(salt.find('.ring__alert').exists()).toBe(true)
    expect(salt.text()).toContain('Limite dépassée de 1,2 g')
  })

  it('ne parle jamais d’excès pour un minimum', () => {
    const fiber = ring({ label: 'Fibres', value: 40, target: 30, mode: 'floor' })

    expect(fiber.text()).toContain('Minimum atteint')
    expect(fiber.text()).toContain('au moins 30 g')
    expect(ring({ label: 'Fibres', value: 7, target: 30, mode: 'floor' }).text()).toContain(
      'Encore 23 g',
    )
  })

  it('montre le dépassement par un second tour', () => {
    expect(ring({ value: 100 }).find('.ring__overflow').exists()).toBe(false)
    expect(ring({ value: 225 }).find('.ring__overflow').exists()).toBe(true)
  })

  it('marque la moyenne d’un trait, et la dit en toutes lettres', () => {
    const wrapper = ring({ average: 120 })

    expect(wrapper.find('.ring__average').exists()).toBe(true)
    expect(wrapper.text()).toContain('Moyenne : 120 g')
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuetext')).toContain(
      'Moyenne des 7 derniers jours : 120 g',
    )
    expect(ring({}).find('.ring__average').exists()).toBe(false)
  })

  it('ne divise pas par zéro sur une cible nulle', () => {
    const empty = ring({ value: 10, target: 0 })

    expect(empty.find('.ring__fill').attributes('stroke-dasharray')).toMatch(/^0\.00 /)
  })

  it('interpole vers la nouvelle valeur au lieu d’y sauter', async () => {
    const wrapper = ring({ value: 0 })
    const dash = () => Number.parseFloat(wrapper.find('.ring__fill').attributes('stroke-dasharray') ?? '0')

    await wrapper.setProps({ value: 150 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const midway = dash()
    await new Promise((resolve) => setTimeout(resolve, 900))

    expect(midway).toBeLessThan(dash())
    expect(dash()).toBeCloseTo(2 * Math.PI * 42, 1)
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
    expect(planned.get('button').text()).toContain('Mangé')
    expect(eaten.get('button').text()).toContain('Mangé')
  })

  it('distingue les boutons d’une liste par le nom du repas', () => {
    // Quatre repas dans une journée produiraient sinon quatre boutons « Mangé »
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
    expect(mountToggle(null).text()).toContain('Pas encore mangé')
    expect(mountToggle('2026-04-10T12:45:00.000Z').text()).toMatch(/à \d{2}:\d{2}/)
  })

  it('ne casse pas sur une date illisible', () => {
    // Un enregistrement corrompu ne doit pas faire disparaître la commande.
    const wrapper = mountToggle('pas une date')

    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Pas encore mangé')
  })
})

describe('BaseCard', () => {
  it('reste un simple titre quand la carte n’est pas repliable', () => {
    const wrapper = mount(BaseCard, { props: { title: 'Profil' }, slots: { default: 'Contenu' } })

    expect(wrapper.find('h2').text()).toBe('Profil')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('Contenu')
  })

  it('repliée, garde son titre et son sous-titre et masque son contenu', () => {
    const wrapper = mount(BaseCard, {
      props: { title: 'Lundi', subtitle: '1800 kcal', collapsible: true, open: false },
      slots: { default: '<p>Repas</p>' },
    })

    const toggle = wrapper.find('h2 button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.card__subtitle').text()).toBe('1800 kcal')
    const body = wrapper.find(`#${toggle.attributes('aria-controls')}`)
    expect(body.attributes('hidden')).toBeDefined()
  })

  it('dépliée, montre son contenu', () => {
    const wrapper = mount(BaseCard, {
      props: { title: 'Lundi', collapsible: true, open: true },
      slots: { default: '<p>Repas</p>' },
    })

    expect(wrapper.find('h2 button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.card__body').attributes('hidden')).toBeUndefined()
  })

  it('demande le changement d’état à son parent', async () => {
    const wrapper = mount(BaseCard, { props: { title: 'Lundi', collapsible: true, open: false } })

    await wrapper.find('h2 button').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[true]])
  })

  it('garde ses actions accessibles une fois repliée', () => {
    const wrapper = mount(BaseCard, {
      props: { title: 'Lundi', subtitle: '1800 kcal', collapsible: true, open: false },
      slots: { default: '<p>Repas</p>', actions: '<button type="button">Ajouter</button>' },
    })

    const action = wrapper.find('.card__actions button')
    expect(action.text()).toBe('Ajouter')
    expect(action.element.closest('[hidden]')).toBeNull()
  })
})


describe('InfoTip', () => {
  const mountTip = () =>
    mount(InfoTip, {
      props: { term: 'glucides', text: 'Les sucres et les féculents.' },
      attachTo: document.body,
    })

  it('nomme son bouton par le mot expliqué et reste muet tant qu’il est fermé', () => {
    const wrapper = mountTip()
    const button = wrapper.find('button')

    expect(button.attributes('aria-label')).toBe('Explication : glucides')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe(wrapper.find('[role="status"]').attributes('id'))
    expect(wrapper.find('[role="status"]').text()).toBe('')
    wrapper.unmount()
  })

  it('écrit l’explication dans la région annoncée à l’ouverture, l’efface au second appui', async () => {
    const wrapper = mountTip()

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="status"]').text()).toBe('Les sucres et les féculents.')

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="status"]').text()).toBe('')
    wrapper.unmount()
  })

  it('se referme avec Échap et rend le focus au bouton', async () => {
    const wrapper = mountTip()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(wrapper.find('button').element)
    wrapper.unmount()
  })

  it('se referme quand on appuie ailleurs, pas dans la bulle', async () => {
    const wrapper = mountTip()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    wrapper.find('[role="status"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('true')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
