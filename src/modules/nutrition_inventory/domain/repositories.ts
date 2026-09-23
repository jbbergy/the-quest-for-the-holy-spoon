import type { DayKey } from '@/core/day'
import type { RepositoryError } from '@/core/errors'
import type { FoodItemId, MealId, PlayerId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { FoodItem, FoodSource } from './FoodItem'
import type { Meal } from './Meal'

/**
 * Ports de persistance du module.
 *
 * Ils ne manipulent que des entités du domaine et ne laissent transparaître
 * aucune notion de clé, d'index ni de transaction. C'est ce qui rend le passage
 * d'IndexedDB à SQLite, à une API HTTP ou à un backend distant un simple
 * changement d'adaptateur — exigence explicite du projet, qui démarre en local
 * mais ne doit pas s'y enfermer.
 */
export interface IFoodRepository {
  findById(id: FoodItemId): Promise<Result<FoodItem | null, RepositoryError>>
  findByBarcode(barcode: string): Promise<Result<FoodItem | null, RepositoryError>>
  searchByName(query: string, limit?: number): Promise<Result<FoodItem[], RepositoryError>>
  /**
   * Toutes les fiches d'une provenance donnée.
   *
   * Ajouté pour l'export : les aliments créés par l'utilisateur sont les seuls
   * du catalogue qu'aucun réamorçage ne pourrait reconstituer. Les repas n'en
   * gardent qu'un instantané figé, pas la fiche elle-même.
   */
  findBySource(source: FoodSource): Promise<Result<FoodItem[], RepositoryError>>
  save(item: FoodItem): Promise<Result<void, RepositoryError>>
  saveMany(items: readonly FoodItem[]): Promise<Result<void, RepositoryError>>
  count(): Promise<Result<number, RepositoryError>>
}

export interface IMealRepository {
  findById(id: MealId): Promise<Result<Meal | null, RepositoryError>>
  /** Repas **prévus** pour ce jour-là, qu'ils aient été composés ce jour ou avant. */
  findByPlayerAndDay(playerId: PlayerId, day: Date): Promise<Result<Meal[], RepositoryError>>
  /**
   * Repas prévus entre deux jours, bornes incluses, triés par jour.
   *
   * Une plage plutôt que sept lectures d'une journée : c'est ce que demande
   * l'affichage d'une semaine, et un adaptateur distant en ferait une seule
   * requête au lieu de sept.
   */
  findByPlayerBetween(
    playerId: PlayerId,
    from: DayKey,
    to: DayKey,
  ): Promise<Result<Meal[], RepositoryError>>
  /** Tout l'historique d'un joueur, du plus ancien au plus récent. Sert à l'export. */
  findAllByPlayer(playerId: PlayerId): Promise<Result<Meal[], RepositoryError>>
  save(meal: Meal): Promise<Result<void, RepositoryError>>
  delete(id: MealId): Promise<Result<void, RepositoryError>>
}
