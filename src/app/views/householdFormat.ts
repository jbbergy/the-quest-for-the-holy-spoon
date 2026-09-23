/** « 8 octobre » : l'échéance d'une invitation, à deux semaines au plus, n'a pas besoin d'année. */
export function formatDay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
