import { PGlite } from '@electric-sql/pglite'
import { Kysely, PostgresDialect } from 'kysely'
import { type Migration, type MigrationProvider, Migrator } from 'kysely/migration'
import pg from 'pg'

import * as m001 from './migrations/001_accounts'
import * as m002 from './migrations/002_records'
import * as m003 from './migrations/003_households'
import { pgliteDialect } from './pglite'
import type { Database } from './schema'

/**
 * Migrations déclarées explicitement plutôt que lues sur disque : l'ordre est
 * celui du code, et le serveur n'a pas besoin de connaître son propre chemin
 * d'installation.
 */
const MIGRATIONS: Record<string, Migration> = {
  '001_accounts': m001,
  '002_records': m002,
  '003_households': m003,
}

const provider: MigrationProvider = { getMigrations: async () => MIGRATIONS }

export type Db = Kysely<Database>

/**
 * Ouvre la base.
 *
 * - `url` défini : vrai Postgres, celui de la production ;
 * - `dataDir` défini : PGlite persistant sur disque, pour le développement ;
 * - ni l'un ni l'autre : PGlite en mémoire, une base neuve par test.
 */
export function openDatabase(options: { url?: string; dataDir?: string } = {}): Db {
  if (options.url !== undefined) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: options.url }) }),
    })
  }
  return new Kysely<Database>({ dialect: pgliteDialect(new PGlite(options.dataDir)) })
}

export async function migrateToLatest(db: Db): Promise<void> {
  const { error, results } = await new Migrator({ db, provider }).migrateToLatest()
  const failed = results?.find((result) => result.status === 'Error')
  if (error !== undefined || failed !== undefined) {
    throw new Error(`Migration impossible (${failed?.migrationName ?? 'inconnue'})`, {
      cause: error,
    })
  }
}
