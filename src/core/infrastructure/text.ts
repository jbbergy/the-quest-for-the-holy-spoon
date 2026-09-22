/**
 * Normalisation du texte pour la recherche d'aliments.
 *
 * Un catalogue français impose d'ignorer les accents et la casse : sans cela,
 * « crème » ne se trouve pas en tapant « creme », ce qui est le cas courant sur
 * un clavier mobile. La normalisation est appliquée **à l'indexation comme à la
 * requête**, via cette seule fonction, pour qu'elles ne puissent pas diverger.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .trim()
}

/** Mots trop courts ou trop fréquents pour discriminer un aliment. */
const STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'de',
  'du',
  'des',
  'en',
  'et',
  'la',
  'le',
  'les',
  'ou',
  'sans',
  'sur',
  'un',
  'une',
])

/**
 * Découpe un nom en jetons indexables. Les jetons alimentent un index
 * `multiEntry`, ce qui permet de retrouver « Blanc de poulet » en tapant
 * « poulet » — impossible avec un index sur le nom complet.
 */
export function tokenize(value: string): string[] {
  const tokens = normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))

  return [...new Set(tokens)]
}
