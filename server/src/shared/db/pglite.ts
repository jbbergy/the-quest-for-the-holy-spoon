import type { PGlite } from '@electric-sql/pglite'
import { PostgresDialect } from 'kysely'

/**
 * Dialecte Kysely pour PGlite, le Postgres compilé en WebAssembly.
 *
 * Kysely sait déjà parler à Postgres à travers le pilote `pg` : il suffit de lui
 * présenter PGlite sous la forme d'un pool `pg`. PGlite n'a qu'**une** connexion,
 * alors que Kysely suppose un pool : sans verrou, deux requêtes HTTP
 * concurrentes entrelaceraient leurs instructions à l'intérieur d'une même
 * transaction. Le pool ci-dessous ne prête donc la connexion qu'à un emprunteur
 * à la fois — c'est ce qui rend ce substitut fidèle au vrai Postgres.
 */
export function pgliteDialect(db: PGlite): PostgresDialect {
  return new PostgresDialect({ pool: new PGlitePool(db) as never })
}

interface PgLikeResult {
  readonly command: string
  readonly rowCount: number
  readonly rows: unknown[]
}

class PGlitePool {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly db: PGlite) {}

  async connect(): Promise<{ query: PGlitePool['query']; release: () => void }> {
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    const previous = this.queue
    this.queue = previous.then(() => released)
    await previous

    return { query: (sql, parameters) => this.query(sql, parameters), release }
  }

  async query(sql: string, parameters: readonly unknown[] = []): Promise<PgLikeResult> {
    const result = await this.db.query(sql, [...parameters])
    return {
      // `pg` renvoie le verbe SQL exécuté ; Kysely s'en sert pour savoir s'il doit
      // lire le nombre de lignes touchées.
      command: /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? '',
      rowCount: result.affectedRows ?? result.rows.length,
      rows: result.rows,
    }
  }

  async end(): Promise<void> {
    await this.db.close()
  }
}
