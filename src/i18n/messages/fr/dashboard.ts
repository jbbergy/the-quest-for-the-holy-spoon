/** Accueil : la journée en cours. */
export const dashboard = {
  eyebrow: 'Aujourd’hui, {day}',
  hello: 'Bonjour, {name}',
  helloAnonymous: 'Bonjour',
  mealsTitle: 'Repas du jour',
  plannedNotice:
    '{n} repas prévu, pas encore mangé. Cochez « Mangé » quand vous le mangez. | {n} repas prévus, pas encore mangés. Cochez « Mangé » quand vous les mangez.',
  emptyTitle: 'Aucun repas prévu aujourd’hui.',
  emptyDescription: 'Ajoutez le repas que vous allez manger, ou préparez ceux de la semaine.',
  edit: ' — modifier',
  addMeal: 'Ajouter un repas',
  viewWeek: 'Voir la semaine',
  adviceTitle: 'Conseil du jour',
  overview: {
    needForDay: 'Votre besoin pour la journée : {kcal}.',
    onlyEaten: 'Seuls les repas mangés comptent.',
    limitsTitle: 'À ne pas dépasser',
    limitsSubtitle: 'Il vaut mieux rester sous ces limites.',
    recentTitle: 'Ces {n} derniers jours',
    noRecent:
      'Pas encore de jour à comparer. Cochez « Mangé » sur vos repas : la moyenne apparaîtra ici dès demain.',
    averagePerDay:
      'Moyenne par jour, sur {n} jour avec des repas mangés. | Moyenne par jour, sur {n} jours avec des repas mangés.',
    dayByDay: 'Voir jour par jour',
    noMealEaten: 'Aucun repas mangé : ce jour ne compte pas dans la moyenne.',
    overLimits: '{list} : au-dessus de la limite',
    gap: {
      aboveLimit: '{amount} au-dessus de la limite',
      underLimit: 'sous la limite',
      floorReached: 'minimum atteint',
      belowFloor: '{amount} de moins que le minimum',
      atTarget: 'au niveau du besoin',
      belowTarget: '{amount} de moins que le besoin',
      aboveTarget: '{amount} de plus que le besoin',
    },
  },
} as const
