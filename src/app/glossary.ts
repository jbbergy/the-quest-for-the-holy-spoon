import { lazyTexts } from '@/i18n'

/**
 * Lexique de l'application : un mot par idée, et l'explication des mots
 * qu'on ne peut pas éviter.
 *
 * Les textes suivent les règles du « Facile à lire et à comprendre » (FALC) :
 * phrases courtes, une idée par phrase, mots courants, pas d'abréviation,
 * chiffres en chiffres. Ils n'ont pas été relus par des personnes en situation
 * de handicap intellectuel, comme le label FALC l'exige : ils s'en inspirent.
 *
 * Mots retenus, à employer partout :
 * - un repas **prévu** : composé, pas encore mangé ;
 * - un repas **mangé** : coché, il compte dans les jauges ;
 * - le **besoin** : ce qu'il faut pour la journée (calories, protéines,
 *   glucides, lipides) ;
 * - le **minimum** : ce qu'il faut au moins (fibres) ;
 * - la **limite** : ce qu'il ne faut pas dépasser (sucres, graisses saturées,
 *   sel) ;
 * - un **aliment** : jamais « fiche » ni « produit » ;
 * - les **graisses saturées** : jamais « AG saturés ».
 */
export const GLOSSARY = lazyTexts('glossary', [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugars',
  'saturatedFat',
  'salt',
  'needs',
  'basalMetabolism',
  'dailyExpenditure',
  'formula',
  'weekAverage',
  'ciqual',
  'openFoodFacts',
  'barcode',
  'household',
  'sync',
  'biologicalSex',
] as const)
