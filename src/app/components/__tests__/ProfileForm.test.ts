// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ProfileForm, { type ProfileFormValues } from '@/app/components/ProfileForm.vue'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryRestriction } from '@/modules/player_profile/domain/DietaryPreferences'

const known: ProfileFormValues = {
  name: 'Alex',
  heightCm: 172,
  weightKg: 64.5,
  ageYears: 41,
  biologicalSex: BiologicalSex.FEMALE,
  activityLevel: ActivityLevel.LIGHT,
  restrictions: [DietaryRestriction.VEGETARIAN],
}

let wrapper: VueWrapper | null = null

function mountForm(initial: ProfileFormValues | null = null): VueWrapper {
  wrapper = mount(ProfileForm, {
    props: { initial, submitLabel: 'Créer mon profil' },
    attachTo: document.body,
  })
  return wrapper
}

/** Le champ dont l'étiquette commence par `label`. */
function field(form: VueWrapper, label: string) {
  const found = form.findAll('.field').find((candidate) =>
    candidate.find('label').text().startsWith(label),
  )
  return found!.find('input')
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ProfileForm', () => {
  it('ne préremplit rien à la création : aucune réponse n’est donnée à la place de la personne', () => {
    const form = mountForm()

    for (const label of ['Prénom', 'Taille', 'Poids', 'Âge']) {
      expect((field(form, label).element as HTMLInputElement).value).toBe('')
      expect(field(form, label).attributes('placeholder')).toBeUndefined()
    }
    expect(form.findAll('input[type="radio"]:checked')).toHaveLength(0)
    expect(form.findAll('input[type="checkbox"]:checked')).toHaveLength(0)
  })

  it('garde le bouton actif et dit ce qui manque, focus sur le premier champ', async () => {
    const form = mountForm()

    const button = form.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await form.find('form').trigger('submit')

    expect(form.emitted('submit')).toBeUndefined()
    expect(form.find('[role="alert"]').text()).toContain('Il manque 6 informations')
    expect(form.text()).toContain('Écrivez un prénom ou un surnom.')
    expect(form.text()).toContain('Choisissez « Femme » ou « Homme ».')
    expect(form.text()).toContain('Choisissez votre activité.')
    expect(field(form, 'Prénom').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(form, 'Prénom').element)
  })

  it('efface le message d’un champ dès qu’il est corrigé', async () => {
    const form = mountForm()
    await form.find('form').trigger('submit')

    await field(form, 'Prénom').setValue('Sam')
    await form.find('input[name="sex"]').setValue(true)

    expect(form.text()).not.toContain('Écrivez un prénom ou un surnom.')
    expect(form.text()).not.toContain('Choisissez « Femme » ou « Homme ».')
    expect(form.find('[role="alert"]').text()).toContain('Il manque 4 informations')
  })

  it('liste ce qui manque, et mène à chaque champ depuis le résumé', async () => {
    const form = mountForm()
    await form.find('form').trigger('submit')

    const links = form.findAll('.profile-form__summary-link')
    expect(links.map((link) => link.text())).toEqual([
      'Prénom ou surnom',
      'Taille',
      'Poids',
      'Âge',
      'Sexe',
      'Votre activité',
    ])
    await links[2]!.trigger('click')
    expect(document.activeElement).toBe(field(form, 'Poids').element)
  })

  it('renvoie les valeurs saisies, prénom nettoyé et régimes cochés', async () => {
    const form = mountForm()

    await field(form, 'Prénom').setValue('  Sam  ')
    await field(form, 'Taille').setValue('180')
    await field(form, 'Poids').setValue('75')
    await field(form, 'Âge').setValue('30')
    await form.find(`input[name="sex"][value="${BiologicalSex.MALE}"]`).setValue(true)
    await form
      .find(`input[name="activity"][value="${ActivityLevel.ACTIVE}"]`)
      .setValue(true)
    await form.find(`input[value="${DietaryRestriction.VEGAN}"]`).trigger('change')
    await form.find(`input[value="${DietaryRestriction.GLUTEN_FREE}"]`).trigger('change')
    await form.find(`input[value="${DietaryRestriction.VEGAN}"]`).trigger('change')
    await form.find('form').trigger('submit')

    expect(form.emitted('submit')?.[0]).toEqual([
      {
        name: 'Sam',
        heightCm: 180,
        weightKg: 75,
        ageYears: 30,
        biologicalSex: BiologicalSex.MALE,
        activityLevel: ActivityLevel.ACTIVE,
        restrictions: [DietaryRestriction.GLUTEN_FREE],
      },
    ])
  })

  it('range les régimes en deux groupes nommés, dont les aliments à éviter', () => {
    const form = mountForm()

    const legends = form.findAll('fieldset legend').map((legend) => legend.text())
    expect(legends).toEqual(expect.arrayContaining(['Mon régime', 'Aliments à éviter']))
    const avoid = form.findAll('fieldset').find((set) => set.find('legend').text() === 'Aliments à éviter')!
    expect(avoid.text()).toContain('Sans porc')
    expect(avoid.text()).toContain('halal ou casher')
    expect(form.text()).toContain('Elle ne vérifie pas les certifications halal ou casher.')
  })

  it('reprend le profil existant pour le modifier', async () => {
    const form = mountForm(known)

    expect((field(form, 'Poids').element as HTMLInputElement).value).toBe('64.5')
    expect(
      (form.find(`input[name="activity"][value="${ActivityLevel.LIGHT}"]`).element as HTMLInputElement)
        .checked,
    ).toBe(true)
    await form.find('form').trigger('submit')

    expect(form.emitted('submit')?.[0]).toEqual([known])
  })
})
