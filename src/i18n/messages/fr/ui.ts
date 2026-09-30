/** Composants de base de `src/ui/`. */
export const ui = {
  required: '(obligatoire)',
  cancel: 'Annuler',
  infoTip: 'Explication : {term}',
  source: {
    ciqual: 'Catalogue public',
    openFoodFacts: 'Produit de marque',
    user: 'Mon aliment',
    addedBy: 'Ajouté par {author}',
  },
  consumed: {
    label: 'Mangé',
    at: 'à {time}',
    not: 'Pas encore mangé',
  },
  password: {
    show: 'Afficher',
    hide: 'Masquer',
    theField: 'le mot de passe',
  },
  gauge: {
    limitExceeded: 'Limite dépassée de {rest}',
    underLimit: 'Sous la limite',
    floorReached: 'Minimum atteint',
    remaining: 'Encore {rest}',
    targetReached: 'Besoin atteint',
    overTarget: '{rest} de plus que le besoin',
    limitOf: 'limite {bound}',
    atLeast: 'au moins {bound}',
    outOf: 'sur {bound}',
    average: 'Moyenne : {value} {unit}',
    averageSpoken: 'Moyenne des 7 derniers jours : {value} {unit}',
    spoken: '{label} : {value} {unit}, {reference}. {status}.',
  },
} as const
