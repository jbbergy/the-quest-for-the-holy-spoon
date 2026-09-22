/**
 * Clé de journée `AAAA-MM-JJ`, en **heure locale**.
 *
 * Un repas pris à 22 h appartient à la journée de l'utilisateur, pas à celle du
 * fuseau UTC : découper sur `toISOString()` rangerait les dîners du soir dans le
 * lendemain pour tout fuseau à l'est de Greenwich.
 *
 * Cette fonction vit dans le noyau parce que deux couches en dépendent — le
 * stockage, pour son index `[playerId, dayKey]`, et l'application, pour libeller
 * le journal. Deux implémentations finiraient par diverger sur ce point
 * exactement.
 */
export function dayKeyOf(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
