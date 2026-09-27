import { type Kysely, sql } from 'kysely'

/**
 * Liste de courses du foyer.
 *
 * - Nouvelle entité `shopping` : un article de la liste.
 * - Colonne `household_id` : un enregistrement commun à tous les membres d'un
 *   foyer, que chacun peut écrire. La dissolution du foyer l'emporte avec lui.
 *   Les autres enregistrements gardent `null` et ne changent pas de règle.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs', 'shopping'))`.execute(db)

  await db.schema
    .alterTable('records')
    .addColumn('household_id', 'uuid', (col) => col.references('households.id').onDelete('cascade'))
    .execute()

  await sql`create index records_by_household_revision on records (household_id, revision)
    where household_id is not null`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index records_by_household_revision`.execute(db)
  await sql`delete from records where entity = 'shopping'`.execute(db)
  await db.schema.alterTable('records').dropColumn('household_id').execute()
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs'))`.execute(db)
}
