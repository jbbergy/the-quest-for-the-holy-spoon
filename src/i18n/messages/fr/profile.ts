/** Création et modification du profil. */
export const profile = {
  setup: {
    title: 'Créer mon profil',
    intro1:
      'L’application a besoin de quelques informations sur vous. Elle s’en sert pour calculer ce que votre corps dépense chaque jour.',
    intro2:
      'Ces informations restent sur cet appareil. Si vous créez un compte, personne d’autre ne voit votre taille, votre poids ni votre âge.',
    submit: 'Créer mon profil',
  },
  edit: {
    title: 'Modifier mon profil',
    intro:
      'Si vous changez votre corps ou votre activité, votre besoin est recalculé. Les portions de vos repas prévus s’ajustent aussi.',
    save: 'Enregistrer',
    saved: 'Votre profil est enregistré.',
    targetChanged: 'Votre besoin passe de {before} à {after} kcal par jour.',
    pastDays: 'Les jours passés gardent l’ancien besoin.',
    rescaled:
      'Les portions de {n} repas prévu ont été ajustées. Les repas déjà mangés ne changent pas. | Les portions de {n} repas prévus ont été ajustées. Les repas déjà mangés ne changent pas.',
  },
  form: {
    summary: 'Il manque {n} information\u00A0: | Il manque {n} informations\u00A0:',
    you: 'Vous',
    name: 'Prénom ou surnom',
    nameHint: 'Il s’affiche sur l’accueil, et dans le foyer si vous en avez un.',
    bodyTitle: 'Votre corps',
    bodySubtitle: 'Ces informations servent à calculer vos besoins. Elles restent privées.',
    height: 'Taille',
    weight: 'Poids',
    age: 'Âge',
    ageSuffix: 'ans',
    sex: 'Sexe',
    sexTerm: 'sexe',
    activityTitle: 'Votre activité',
    activityLegend: 'Votre activité (obligatoire)',
    dietTitle: 'Votre régime',
    dietSubtitle:
      'Facultatif. Les aliments qui ne vous conviennent pas seront masqués dans la recherche.',
    groupDiet: 'Mon régime',
    groupAvoid: 'Aliments à éviter',
    dietNote:
      'L’application reconnaît les aliments à leur nom. Elle ne vérifie pas les certifications halal ou casher. Lisez toujours l’étiquette.',
    missing: {
      name: 'Écrivez un prénom ou un surnom.',
      heightCm: 'Écrivez votre taille, en centimètres. Par exemple\u00A0: 170.',
      weightKg: 'Écrivez votre poids, en kilos. Par exemple\u00A0: 65.',
      ageYears: 'Écrivez votre âge, en années.',
      biologicalSex: 'Choisissez «\u00A0Femme\u00A0» ou «\u00A0Homme\u00A0».',
      activityLevel: 'Choisissez votre activité.',
    },
  },
} as const
