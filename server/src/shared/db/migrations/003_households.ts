import { type Kysely, sql } from 'kysely'

/**
 * Foyers, membres et invitations.
 *
 * La clé primaire de `household_members` est le compte seul : c'est la base
 * elle-même qui garantit qu'un compte n'appartient qu'à un foyer, même si deux
 * acceptations arrivaient au même instant.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('households')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    // Supprimer le compte du propriétaire dissout le foyer.
    .addColumn('owner_account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('household_members')
    .addColumn('account_id', 'uuid', (col) =>
      col.primaryKey().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('household_id', 'uuid', (col) =>
      col.notNull().references('households.id').onDelete('cascade'),
    )
    .addColumn('joined_at', 'timestamptz', (col) => col.notNull())
    .addColumn('shares_days', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute()
  await db.schema
    .createIndex('household_members_by_household')
    .on('household_members')
    .column('household_id')
    .execute()

  await db.schema
    .createTable('household_invitations')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('household_id', 'uuid', (col) =>
      col.notNull().references('households.id').onDelete('cascade'),
    )
    // Normalisée par le VO `Email`. Aucune clé vers `accounts` : on invite aussi
    // une adresse qui n'a pas encore de compte.
    .addColumn('email', 'text', (col) => col.notNull())
    .addColumn('invited_at', 'timestamptz', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('household_invitations_once_per_email', ['household_id', 'email'])
    .execute()
  await db.schema
    .createIndex('household_invitations_by_email')
    .on('household_invitations')
    .column('email')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('household_invitations').execute()
  await db.schema.dropTable('household_members').execute()
  await db.schema.dropTable('households').execute()
}
