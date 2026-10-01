import type { Messages } from '../schema'
import type { profile as fr } from '../fr/profile'

export const profile: Messages<typeof fr> = {
  setup: {
    title: 'Create my profile',
    intro1:
      'The app needs a few details about you. It uses them to work out how much energy your body uses each day.',
    intro2:
      'These details stay on this device. If you create an account, nobody else sees your height, weight or age.',
    submit: 'Create my profile',
  },
  edit: {
    title: 'Edit my profile',
    intro:
      'If your body or your activity changes, your target is recalculated. The portions of your planned meals are adjusted too.',
    save: 'Save',
    saved: 'Your profile is saved.',
    targetChanged: 'Your target goes from {before} to {after} kcal per day.',
    pastDays: 'Past days keep the old target.',
    rescaled:
      'The portions of {n} planned meal have been adjusted. Meals already eaten do not change. | The portions of {n} planned meals have been adjusted. Meals already eaten do not change.',
  },
  form: {
    summary: '{n} piece of information is missing: | {n} pieces of information are missing:',
    you: 'You',
    name: 'First name or nickname',
    nameHint: 'It is shown on the home screen, and in the household if you have one.',
    bodyTitle: 'Your body',
    bodySubtitle: 'These details are used to work out your needs. They stay private.',
    height: 'Height',
    weight: 'Weight',
    age: 'Age',
    ageSuffix: 'years',
    sex: 'Sex',
    sexTerm: 'sex',
    activityTitle: 'Your activity',
    activityLegend: 'Your activity (required)',
    dietTitle: 'Your diet',
    dietSubtitle: 'Optional. Foods that do not suit you will be hidden in the search.',
    groupDiet: 'My diet',
    groupAvoid: 'Foods to avoid',
    dietNote:
      'The app recognises foods by their name. It does not check halal or kosher certifications. Always read the label.',
    missing: {
      name: 'Write a first name or a nickname.',
      heightCm: 'Write your height, in centimetres. For example: 170.',
      weightKg: 'Write your weight, in kilograms. For example: 65.',
      ageYears: 'Write your age, in years.',
      biologicalSex: 'Choose “Female” or “Male”.',
      activityLevel: 'Choose your activity.',
    },
  },
}
