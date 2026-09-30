/**
 * Page « Comment sont calculés mes repères ? ». Les `**…**` sont mis en gras.
 * Les nombres viennent du code : la page ne peut pas se désaccorder du calcul.
 */
export const calculations = {
  title: 'Comment sont calculés mes repères ?',
  intro:
    'Cette page explique d’où viennent les chiffres de l’application. D’abord ceux des aliments. Ensuite ceux de votre journée. Les nombres en gras sont les vôtres.',
  caveat:
    'Ces repères aident à manger équilibré. Ils ne remplacent pas l’avis d’un médecin ou d’un diététicien.',
  foods: {
    title: '1. Ce que contient un aliment',
    subtitle: 'Les chiffres viennent de bases de données publiques.',
    ciqual: 'Les aliments courants (pomme, riz, poulet…) viennent de **Ciqual**, le catalogue public de l’Anses.',
    off: 'Les produits de marque viennent d’**Open Food Facts**, une base libre remplie par des bénévoles.',
    own: 'Les aliments que vous créez vous-même gardent les chiffres que vous avez écrits.',
    per100: 'Les chiffres sont donnés **pour 100 g**. Pour un liquide de marque, c’est pour 100 ml.',
  },
  eaten: {
    title: '2. Ce que vous mangez',
    subtitle: 'Le calcul se fait pour la portion que vous avez choisie.',
    portions:
      '**Les portions.** Si vous choisissez « 1 tranche », l’application la convertit en grammes. Un signe « ≈ » veut dire que le poids de la tranche est une moyenne.',
    crossProduct:
      '**Le produit en croix.** Chaque chiffre de l’aliment est multiplié par la portion, puis divisé par 100.',
    calories:
      '**Les calories.** Elles sont calculées avec les protéines, les glucides et les lipides : {protein} kcal par gramme de protéines, {carbs} kcal par gramme de glucides, {fat} kcal par gramme de lipides.',
    example:
      '**Exemple.** Pour 100 g, un aliment contient {proteinG} g de protéines, {carbsG} g de glucides et {fatG} g de lipides. Cela fait {proteinG} × {protein} + {carbsG} × {carbs} + {fatG} × {fat} = **{per100} kcal** pour 100 g. Pour {grams} g, on multiplie par {factor} : **{total} kcal**.',
    others:
      'Les fibres, les sucres, les graisses saturées et le sel se calculent de la même façon. Ils ne s’ajoutent pas aux calories : ils sont déjà dedans, sauf le sel, qui n’en donne aucune.',
    missing:
      'Quand une base ne donne pas une valeur, l’application compte 0. Pour le sel, Open Food Facts donne parfois le sodium : l’application le multiplie par 2,5.',
    onlyEaten:
      'Seuls les repas **cochés comme mangés** comptent dans vos jauges. Un repas prévu ne compte pas encore.',
    frozen:
      'Un repas mangé garde les chiffres du jour où vous l’avez ajouté. Si l’aliment est corrigé plus tard, votre journée passée ne change pas.',
  },
  need: {
    title: '3. Votre besoin en calories',
    subtitle: 'C’est l’énergie que votre corps dépense en une journée.',
    resting:
      '**Au repos.** L’application utilise la formule de Mifflin-St Jeor : 10 × poids + 6,25 × taille − 5 × âge, puis {sexTerm} pour {sexLabel}.',
    restingMine: '10 × {weight} + 6,25 × {height} − 5 × {age} {sexTerm} = **{rest} kcal**',
    sexMale: 'un homme',
    sexFemale: 'une femme',
    withActivity:
      '**Avec votre activité.** On multiplie par un coefficient : 1,2 si l’on bouge très peu, jusqu’à 1,9 pour un métier physique. Le vôtre : « {activity} ».',
    withActivityMine: '{rest} × {multiplier} = **{need} kcal par jour**',
    note: 'Ce nombre est votre besoin. L’application ne vous demande ni de maigrir, ni de grossir : elle vise l’équilibre. C’est une estimation, pas une mesure exacte.',
  },
  macros: {
    title: '4. Vos protéines, glucides et lipides',
    subtitle: 'Votre besoin en calories est partagé en trois.',
    intro:
      'Le partage suit les repères de l’Anses. Il est le même pour tout le monde. Chaque part est ensuite transformée en grammes, avec les mêmes kcal par gramme qu’au point 2.',
    line: '{share} de {need} kcal ÷ {kcalPerGram} = **{grams} g**',
  },
  limits: {
    title: '5. Fibres, sucres, graisses saturées et sel',
    subtitle: 'Ici, il y a un minimum ou une limite.',
    fiber: 'Un **minimum** : au moins 30 g par jour.',
    sugars: 'Une **limite** : pas plus de 100 g par jour.',
    saturatedFat:
      'Une **limite** : {share} de {need} kcal ÷ {kcalPerGram} = **{grams} g**. C’est la seule qui change d’une personne à l’autre.',
    salt: 'Une **limite** : moins de 5 g par jour.',
    sugarsNote:
      'Pour les sucres, l’application compte aussi ceux du lait et des fruits. La limite est donc un peu sévère : c’est voulu.',
  },
  average: {
    title: '6. La moyenne des 7 derniers jours',
    subtitle: 'Votre corps ne compte pas jour par jour.',
    days: 'L’application prend les {n} jours **avant aujourd’hui**.',
    ignored:
      'Un jour où vous n’avez marqué **aucun repas mangé** est ignoré. Ce n’est pas un jeûne : c’est un jour non renseigné.',
    compare:
      'Pour chaque autre jour, elle compare ce que vous avez mangé au besoin que vous aviez ce jour-là. Puis elle fait la moyenne.',
    note: 'Cette moyenne **ne change pas** votre objectif du lendemain. Manger plus un jour n’oblige pas à manger moins le suivant.',
  },
} as const
