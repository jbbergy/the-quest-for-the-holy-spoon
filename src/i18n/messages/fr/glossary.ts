/**
 * Lexique de l'application : un mot par idée, et l'explication des mots
 * qu'on ne peut pas éviter. Voir `src/app/glossary.ts` pour les règles de
 * rédaction (FALC) et le vocabulaire retenu.
 */
export const glossary = {
  calories: 'L’énergie que vous donnent les aliments. On la compte en kilocalories (kcal).',
  protein:
    'Elles construisent et réparent les muscles. Il y en a dans la viande, le poisson, les œufs, les légumes secs et les produits laitiers.',
  carbs:
    'Ils donnent de l’énergie. Ce sont les féculents et les sucres\u00A0: pain, pâtes, riz, pommes de terre, fruits.',
  fat: 'Ce sont les graisses\u00A0: huile, beurre, fromage, fruits à coque. Le corps en a besoin, en petite quantité.',
  fiber:
    'Elles aident à bien digérer. Il y en a dans les légumes, les fruits, les légumes secs et le pain complet.',
  sugars:
    'Les sucres qui passent vite dans le sang\u00A0: sucre, bonbons, sodas, gâteaux. Les fruits et le lait en contiennent aussi.',
  saturatedFat:
    'Des graisses surtout animales\u00A0: beurre, fromage, charcuterie, viennoiseries. En manger trop est mauvais pour le cœur.',
  salt: 'Il y en a beaucoup dans le pain, le fromage, la charcuterie et les plats tout prêts.',
  needs:
    'L’énergie que votre corps dépense en une journée. L’application la calcule avec votre taille, votre poids, votre âge et votre activité.',
  basalMetabolism:
    'L’énergie que votre corps dépense au repos\u00A0: pour respirer, rester au chaud, faire battre le cœur.',
  dailyExpenditure: 'L’énergie dépensée au repos, plus celle de vos activités de la journée.',
  formula:
    'L’application utilise la formule de Mifflin-St Jeor. C’est une formule reconnue par les nutritionnistes. Elle donne une estimation, pas une mesure exacte.',
  weekAverage:
    'Votre corps ne compte pas jour par jour. L’application regarde donc aussi la moyenne des 7 derniers jours. Un jour sans repas mangé ne compte pas.',
  ciqual:
    'Le catalogue public des aliments en France, publié par l’Anses. Il donne les valeurs des aliments courants\u00A0: pomme, riz, poulet…',
  openFoodFacts:
    'Une base de données libre, remplie par des bénévoles. Elle contient les produits de marque vendus en magasin.',
  barcode: 'Le numéro écrit sous les barres, sur l’emballage. Il a de 8 à 14 chiffres.',
  household:
    'Un groupe de personnes qui mangent souvent ensemble. Chacun voit les repas des autres et peut prévoir un repas pour plusieurs.',
  sync: 'Vos changements partent sur votre compte. Vous les retrouvez sur vos autres appareils.',
  biologicalSex:
    'Le corps d’un homme et celui d’une femme ne dépensent pas la même énergie. La formule en tient compte.',
} as const
