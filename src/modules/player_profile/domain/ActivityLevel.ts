/**
 * Niveau d'activité et son multiplicateur de dépense énergétique.
 *
 * Les coefficients sont ceux couramment associés à Mifflin-St Jeor pour passer
 * du métabolisme de base (BMR) à la dépense totale (TDEE).
 */
export const ActivityLevel = {
  SEDENTARY: 'SEDENTARY',
  LIGHT: 'LIGHT',
  MODERATE: 'MODERATE',
  ACTIVE: 'ACTIVE',
  VERY_ACTIVE: 'VERY_ACTIVE',
} as const
export type ActivityLevel = (typeof ActivityLevel)[keyof typeof ActivityLevel]

export const ACTIVITY_MULTIPLIER: Readonly<Record<ActivityLevel, number>> = {
  [ActivityLevel.SEDENTARY]: 1.2,
  [ActivityLevel.LIGHT]: 1.375,
  [ActivityLevel.MODERATE]: 1.55,
  [ActivityLevel.ACTIVE]: 1.725,
  [ActivityLevel.VERY_ACTIVE]: 1.9,
}

export function activityMultiplier(level: ActivityLevel): number {
  return ACTIVITY_MULTIPLIER[level]
}
