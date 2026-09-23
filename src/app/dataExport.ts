import type { FoodExport, MealExport } from '@/modules/nutrition_inventory/application'
import type { PlayerExport } from '@/modules/player_profile/application'

/**
 * Format d'archive des données locales.
 *
 * Toute l'application vit dans le navigateur, sans compte ni serveur : vider les
 * données du site suffit à tout perdre. L'export est donc la seule porte de
 * sortie, et il est conçu pour être **lu sans l'application** — clés explicites,
 * dates ISO, portions détaillées — plutôt que pour une restauration automatique
 * qui n'existe pas encore.
 *
 * `format` et `version` sont en tête pour qu'un futur import puisse refuser un
 * fichier étranger avant d'en interpréter la moindre valeur.
 */
export const EXPORT_FORMAT = 'holy-spoon/export'
/**
 * Version 2 : plus de section `progress` (le système d'XP a été retiré) et un
 * `plannedFor` sur chaque repas, distinct de `loggedAt` depuis la planification.
 */
export const EXPORT_VERSION = 2

export interface HolySpoonExport {
  readonly format: typeof EXPORT_FORMAT
  readonly version: typeof EXPORT_VERSION
  readonly exportedAt: string
  readonly player: PlayerExport
  readonly meals: readonly MealExport[]
  readonly customFoods: readonly FoodExport[]
}

export interface ExportParts {
  readonly player: PlayerExport
  readonly meals: readonly MealExport[]
  readonly customFoods: readonly FoodExport[]
}

/**
 * Assemble l'archive. Fonction **pure** : la date est un paramètre, jamais un
 * `new Date()` caché, sans quoi le résultat serait intestable.
 */
export function buildExport(parts: ExportParts, exportedAt: Date): HolySpoonExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    player: parts.player,
    meals: parts.meals,
    customFoods: parts.customFoods,
  }
}

/**
 * Nom du fichier proposé au téléchargement.
 *
 * Daté en heure **locale** : l'utilisateur retrouve le fichier par le jour où il
 * l'a produit, pas par un décalage UTC qui le classerait la veille en soirée.
 */
export function exportFileName(exportedAt: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = [
    exportedAt.getFullYear(),
    pad(exportedAt.getMonth() + 1),
    pad(exportedAt.getDate()),
  ].join('-')

  return `holy-spoon-${day}.json`
}
