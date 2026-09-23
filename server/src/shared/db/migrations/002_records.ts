import { type Kysely, sql } from 'kysely'

/**
 * Enregistrements synchronisés. La révision vient d'une séquence unique : elle
 * ordonne toutes les écritures, et sert de curseur aux appareils.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create sequence records_revision_seq`.execute(db)

  await db.schema
    .createTable('records')
    .addColumn('entity', 'text', (col) =>
      col.notNull().check(sql`entity in ('player', 'meal', 'food')`),
    )
    .addColumn('id', 'text', (col) => col.notNull())
    // Supprimer un compte supprime ses données, sans étape à oublier.
    .addColumn('owner_account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('payload', 'jsonb')
    .addColumn('deleted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('revision', 'bigint', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('records_pk', ['entity', 'id'])
    .execute()

  await db.schema
    .createIndex('records_by_owner_revision')
    .on('records')
    .columns(['owner_account_id', 'revision'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('records').execute()
  await sql`drop sequence records_revision_seq`.execute(db)
}
