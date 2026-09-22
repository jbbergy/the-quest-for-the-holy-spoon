import { openDatabase } from './idb'

/**
 * Schéma de la base locale.
 *
 * Un seul fichier décrit les stores et leurs index : les repositories des quatre
 * modules s'y réfèrent par constante, jamais par chaîne littérale. C'est ce qui
 * rend une migration relisable et évite qu'un nom d'index diverge silencieusement
 * entre deux modules.
 */
export const DB_NAME = 'holy-spoon'
export const DB_VERSION = 1

export const STORE = {
  players: 'players',
  foods: 'foods',
  meals: 'meals',
  progress: 'progress',
  meta: 'meta',
} as const

export const INDEX = {
  /** Recherche par code-barres — unique, un produit par code. */
  foodsByBarcode: 'by_barcode',
  /**
   * Recherche textuelle : index `multiEntry` sur les jetons normalisés du nom.
   * Il permet de retrouver « Blanc de poulet » en tapant « poulet », ce qu'un
   * simple index sur le nom complet ne saurait pas faire.
   */
  foodsByToken: 'by_token',
  /** Repas d'un joueur pour une journée : clé composée `[playerId, dayKey]`. */
  mealsByPlayerDay: 'by_player_day',
} as const

/** Clés du store `meta`, qui porte les singletons de l'application. */
export const META_KEY = {
  currentPlayerId: 'current_player_id',
  ciqualSeedVersion: 'ciqual_seed_version',
} as const

export function openHolySpoonDatabase(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db, oldVersion) => {
    if (oldVersion < 1) {
      db.createObjectStore(STORE.players, { keyPath: 'id' })

      const foods = db.createObjectStore(STORE.foods, { keyPath: 'id' })
      // Non unique : deux fiches peuvent légitimement manquer de code-barres
      // (Ciqual n'en a pas), et l'index ignore simplement les valeurs absentes.
      foods.createIndex(INDEX.foodsByBarcode, 'barcode', { unique: false })
      foods.createIndex(INDEX.foodsByToken, 'searchTokens', {
        unique: false,
        multiEntry: true,
      })

      const meals = db.createObjectStore(STORE.meals, { keyPath: 'id' })
      meals.createIndex(INDEX.mealsByPlayerDay, ['playerId', 'dayKey'], { unique: false })

      db.createObjectStore(STORE.progress, { keyPath: 'playerId' })
      db.createObjectStore(STORE.meta, { keyPath: 'key' })
    }
  })
}

/**
 * Fournisseur de connexion partagé par tous les repositories.
 *
 * La connexion est ouverte une fois et réutilisée ; l'ouverture concurrente est
 * dédoublonnée en mémorisant la promesse plutôt que son résultat, sans quoi
 * quatre repositories créés en parallèle ouvriraient quatre connexions.
 */
export class DatabaseProvider {
  private connection: Promise<IDBDatabase> | null = null

  constructor(private readonly open: () => Promise<IDBDatabase> = openHolySpoonDatabase) {}

  get(): Promise<IDBDatabase> {
    if (this.connection === null) {
      this.connection = this.open().catch((error: unknown) => {
        // Un échec ne doit pas être mémorisé : la tentative suivante doit pouvoir
        // réessayer (l'utilisateur a pu quitter la navigation privée entre-temps).
        this.connection = null
        throw error
      })
    }
    return this.connection
  }

  async close(): Promise<void> {
    const connection = this.connection
    this.connection = null
    if (connection !== null) {
      await connection.then(
        (db) => db.close(),
        () => undefined,
      )
    }
  }
}
