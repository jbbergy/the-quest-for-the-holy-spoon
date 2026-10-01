import { dateFormat } from '@/i18n'

/** « 8 octobre » : l'échéance d'une invitation, à deux semaines au plus, n'a pas besoin d'année. */
export function formatDay(date: Date): string {
  return dateFormat({ day: 'numeric', month: 'long' }).format(date)
}

/**
 * « d’Alex », « de Camille » : « de » s'élide devant une voyelle ou un h muet.
 * Le h est traité comme muet — le cas le plus courant pour un prénom.
 */
export function ofName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûü]/iu.test(name) ? `d’${name}` : `de ${name}`
}

/**
 * Paramètres d'une phrase qui parle d'une personne : `{name}` pour l'anglais
 * (« Alex’s day »), `{of}` pour le français (« Journée d’Alex »), dont l'article
 * s'élide. Chaque langue emploie celui qu'il lui faut.
 */
export function nameParams(name: string): { name: string; of: string } {
  return { name, of: ofName(name) }
}
