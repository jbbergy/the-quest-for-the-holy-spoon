import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('email_verified_at', 'timestamptz')
    .addColumn('player_id', 'text', (col) => col.unique())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('sessions')
    .addColumn('token_hash', 'text', (col) => col.primaryKey())
    .addColumn('account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .execute()
  await db.schema.createIndex('sessions_by_account').on('sessions').column('account_id').execute()

  await db.schema
    .createTable('email_tokens')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('purpose', 'text', (col) =>
      col.notNull().check(sql`purpose in ('verify_email', 'reset_password')`),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema
    .createIndex('email_tokens_by_account')
    .on('email_tokens')
    .columns(['account_id', 'purpose'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('email_tokens').execute()
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('accounts').execute()
}
