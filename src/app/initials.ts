/**
 * Initiales d'un prénom ou surnom, pour une pastille d'avatar.
 *
 * Les deux premiers mots donnent une lettre chacun (« Jean-Baptiste » → « JB »,
 * « Camille » → « C »). Les lettres sont prises par caractère affiché, pas par
 * unité de code : un nom qui commence par un accent composé ou un emoji ne
 * doit pas être coupé en deux.
 */
export function initials(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return name
    .trim()
    .split(/[\s\-‐]+/u)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? '')
    .join('')
    .toLocaleUpperCase()
}
