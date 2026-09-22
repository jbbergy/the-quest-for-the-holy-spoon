import type { DomainError, RemoteUnavailableError, ValidationError } from '@/core/errors'
import type { Result } from '@/core/result'

import type { FoodItem } from './FoodItem'

/** Ce qui peut échouer lors d'une consultation distante, hors bug. */
export type ProviderError = ValidationError | DomainError | RemoteUnavailableError

export { RemoteUnavailableError } from '@/core/errors'

/**
 * Port de consultation d'un catalogue d'aliments distant.
 *
 * Déclaré dans le domaine, implémenté dans l'infrastructure : le module ne sait
 * pas qu'Open Food Facts existe, seulement qu'un code-barres ou un nom peuvent
 * être résolus en `FoodItem` — ou pas.
 *
 * Les deux méthodes distinguent l'absence de la panne. `null` et la liste vide
 * signifient « rien de tel là-bas », un résultat légitime ; une `ProviderError`
 * signifie « je n'ai pas pu aller voir », ce que l'UI doit présenter tout
 * autrement. Les confondre ferait passer une coupure réseau pour un produit
 * inexistant.
 */
export interface IRemoteFoodCatalog {
  findByBarcode(barcode: string): Promise<Result<FoodItem | null, ProviderError>>
  searchByName(query: string, limit: number): Promise<Result<readonly FoodItem[], ProviderError>>
}
