/**
 * Clé de journée `AAAA-MM-JJ`, en **heure locale**.
 *
 * Type marqué : une clé de journée ne se fabrique que par `dayKeyOf` ou
 * `parseDayKey`, jamais en tapant une chaîne quelconque. C'est ce qui permet au
 * domaine de s'y fier sans la revalider à chaque usage — et de comparer deux
 * jours par simple ordre lexicographique, que ce format garantit.
 */
export type DayKey = string & { readonly __brand: 'DayKey' }

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Journée locale d'un instant.
 *
 * Un repas pris à 22 h appartient à la journée de l'utilisateur, pas à celle du
 * fuseau UTC : découper sur `toISOString()` rangerait les dîners du soir dans le
 * lendemain pour tout fuseau à l'est de Greenwich.
 *
 * Cette fonction vit dans le noyau parce que plusieurs couches en dépendent — le
 * stockage, pour son index `[playerId, dayKey]`, le domaine, pour situer un repas
 * prévu, et la présentation, pour naviguer de semaine en semaine. Plusieurs
 * implémentations finiraient par diverger sur ce point exactement.
 */
export function dayKeyOf(date: Date): DayKey {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}` as DayKey
}

/**
 * Lit une clé venue de l'extérieur (URL, stockage) ; `null` si elle ne désigne
 * pas un jour réel. « 2026-02-30 » a la bonne forme mais aucun calendrier ne le
 * connaît : le laisser passer ferait glisser silencieusement au 2 mars.
 */
export function parseDayKey(text: string): DayKey | null {
  const match = DAY_KEY_PATTERN.exec(text)
  if (match === null) return null

  const [, year, month, day] = match.map(Number) as [number, number, number, number]
  const date = new Date(year, month - 1, day)
  return dayKeyOf(date) === text ? (text as DayKey) : null
}

/** Minuit local du jour désigné. */
export function dateOfDay(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/**
 * Décale d'un nombre de jours calendaires.
 *
 * Passe par le calendrier local et non par des multiples de 24 h : les jours de
 * changement d'heure durent 23 ou 25 heures, et une addition de millisecondes y
 * ferait sauter ou répéter une date.
 */
export function addDays(key: DayKey, days: number): DayKey {
  const date = dateOfDay(key)
  date.setDate(date.getDate() + days)
  return dayKeyOf(date)
}

/** Lundi de la semaine qui contient ce jour — la semaine commence le lundi en France. */
export function startOfWeek(key: DayKey): DayKey {
  const weekday = dateOfDay(key).getDay()
  const sinceMonday = (weekday + 6) % 7
  return addDays(key, -sinceMonday)
}

/** Les sept jours, du lundi au dimanche, de la semaine qui contient ce jour. */
export function weekOf(key: DayKey): readonly DayKey[] {
  const monday = startOfWeek(key)
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset))
}

/**
 * Journée en cours pour quelqu'un dont la journée commence à `startHour`.
 *
 * Minuit par défaut. Avec 3 h, il est encore « hier » à 1 h du matin : le
 * dîner tardif et la collation de minuit restent sur la journée qu'on est en
 * train de vivre, plutôt que d'ouvrir une journée vide au milieu de la soirée.
 */
export function currentDay(now: Date, startHour = 0): DayKey {
  const calendar = dayKeyOf(now)
  return now.getHours() < startHour ? addDays(calendar, -1) : calendar
}

/**
 * Instant où `currentDay` changera de valeur : le prochain `startHour` pile.
 * Calculé sur le calendrier local, pour tomber juste les jours de changement
 * d'heure.
 */
export function nextDayStart(now: Date, startHour = 0): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour)
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 1)
  return start
}
