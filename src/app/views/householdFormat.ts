/** « 8 octobre » : l'échéance d'une invitation, à deux semaines au plus, n'a pas besoin d'année. */
export function formatDay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

/**
 * « d’Alex », « de Camille » : « de » s'élide devant une voyelle ou un h muet.
 * Le h est traité comme muet — le cas le plus courant pour un prénom.
 */
export function ofName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûü]/iu.test(name) ? `d’${name}` : `de ${name}`
}
