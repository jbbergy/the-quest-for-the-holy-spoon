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
export const DB_VERSION = 2

export const STORE = {
  players: 'players',
  foods: 'foods',
  meals: 'meals',
  /**
   * Progression d'XP. Plus lue depuis le retrait du système de jeu, mais
   * toujours créée : la migration de la version 1 ne se réécrit pas après coup,
   * et les données déjà stockées restent intactes si le jeu revient.
   */
  progress: 'progress',
  meta: 'meta',
  /**
   * Journal des modifications locales en attente d'envoi au serveur. Il n'est
   * alimenté que lorsqu'un compte est connecté : voir `changeJournal.ts`.
   */
  outbox: 'outbox',
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
  /** Modifications en attente pour un enregistrement donné : `[entity, id]`. */
  outboxByRecord: 'by_record',
} as const

/** Clés du store `meta`, qui porte les singletons de l'application. */
export const META_KEY = {
  currentPlayerId: 'current_player_id',
  ciqualSeedVersion: 'ciqual_seed_version',
  /** Compte synchronisé sur cet appareil, son profil et le curseur de lecture. */
  syncState: 'sync_state',
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

    if (oldVersion < 2) {
      const outbox = db.createObjectStore(STORE.outbox, { keyPath: 'seq', autoIncrement: true })
      outbox.createIndex(INDEX.outboxByRecord, ['entity', 'id'], { unique: false })
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
