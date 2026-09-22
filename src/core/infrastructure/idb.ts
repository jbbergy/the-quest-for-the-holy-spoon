import {
  RepositoryError,
  StorageQuotaExceededError,
  StorageUnavailableError,
} from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Enrobage asynchrone d'IndexedDB natif.
 *
 * Pas de dépendance à `idb` ou Dexie : l'API native suffit dès lors que ses
 * requêtes à callbacks sont promisifiées une bonne fois pour toutes. Tout ce qui
 * sort d'ici est un `Result` — **aucune exception ne franchit cette frontière**,
 * conformément à la règle « un repository ne lève jamais vers l'extérieur ».
 */

/** Promisifie une `IDBRequest`. Rejette avec l'erreur native, traitée plus haut. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Requête IndexedDB en échec'))
  })
}

/** Attend la fin effective d'une transaction d'écriture, pas seulement la requête. */
export function transactionToPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction IndexedDB en échec'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction IndexedDB interrompue'))
  })
}

/**
 * Traduit une erreur technique en `RepositoryError` typée.
 *
 * Le quota dépassé est distingué parce que l'UI doit pouvoir proposer une action
 * (purger l'historique) plutôt qu'un message générique.
 */
export function toRepositoryError(cause: unknown, context: string): RepositoryError {
  if (isDomException(cause)) {
    if (cause.name === 'QuotaExceededError') return new StorageQuotaExceededError({ cause })
    if (cause.name === 'InvalidStateError' || cause.name === 'UnknownError') {
      return new StorageUnavailableError({ cause })
    }
  }
  return new RepositoryError('STORAGE_FAILURE', `Échec du stockage (${context}).`, { cause })
}

function isDomException(value: unknown): value is DOMException {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string'
  )
}

/**
 * Exécute une opération de stockage en convertissant toute exception en `Result`.
 * C'est le point de passage unique : chaque méthode de repository l'emprunte.
 */
export async function guard<T>(
  context: string,
  operation: () => Promise<T>,
): Promise<Result<T, RepositoryError>> {
  try {
    return ok(await operation())
  } catch (cause) {
    return err(toRepositoryError(cause, context))
  }
}

/** Collecte toutes les valeurs d'un index correspondant à une plage de clés. */
export function getAllFromIndex<T>(
  index: IDBIndex,
  range: IDBKeyRange | null,
  count?: number,
): Promise<T[]> {
  return requestToPromise(index.getAll(range ?? undefined, count) as IDBRequest<T[]>)
}

/**
 * Ouvre (et migre) une base. `upgrade` reçoit la base et l'ancienne version, ce
 * qui permet des migrations incrémentales quand le schéma évoluera.
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageUnavailableError())
      return
    }

    const request = indexedDB.open(name, version)

    request.onupgradeneeded = (event) => {
      const tx = request.transaction
      if (tx === null) {
        reject(new StorageUnavailableError())
        return
      }
      upgrade(request.result, event.oldVersion, tx)
    }

    request.onsuccess = () => {
      const db = request.result
      // Une autre session demande une migration : on libère la connexion plutôt
      // que de la bloquer, sinon l'onglet resté ouvert fige la mise à jour.
      db.onversionchange = () => db.close()
      resolve(db)
    }

    request.onerror = () =>
      reject(request.error ?? new Error('Ouverture de la base IndexedDB en échec'))
    request.onblocked = () =>
      reject(new StorageUnavailableError({ cause: 'Une autre session bloque la migration.' }))
  })
}
