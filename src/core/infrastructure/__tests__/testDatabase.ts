/**
 * Installe `indexedDB`, `IDBKeyRange` et les autres globaux IndexedDB.
 *
 * Le navigateur les fournit nativement ; Node non. Sans cet import, les
 * repositories échouent à la première plage de clés — un symptôme purement lié
 * à l'environnement de test, qu'il vaut mieux supprimer une fois ici que
 * contourner dans le code de production.
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'

import { DatabaseProvider, openHolySpoonDatabase } from '@/core/infrastructure/database'

/**
 * Base en mémoire, neuve à chaque appel.
 *
 * `fake-indexeddb` implémente la vraie spécification : ces tests exercent donc
 * les transactions, les index composés et le *structured clone* réels, et non un
 * substitut approximatif. Remplacer la factory globale plutôt que d'injecter une
 * base permet de couvrir le code d'ouverture lui-même, là où vivent les
 * migrations.
 */
export function createTestDatabase(): DatabaseProvider {
  globalThis.indexedDB = new IDBFactory()
  return new DatabaseProvider(openHolySpoonDatabase)
}
