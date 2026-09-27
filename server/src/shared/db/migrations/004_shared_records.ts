import { type Kysely, sql } from 'kysely'

/**
 * Partage au sein du foyer.
 *
 * - Nouvelle entité `needs` : les besoins calculés d'un profil, et son nom.
 *   C'est tout ce qu'un autre membre voit du profil — jamais les mensurations,
 *   qui restent dans l'entité `player`, lisible par son seul compte.
 * - Index des aliments par propriétaire : `pull` lit ceux des membres du foyer.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs'))`.execute(db)

  await db.schema
    .createIndex('records_by_entity_owner_revision')
    .on('records')
    .columns(['entity', 'owner_account_id', 'revision'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('records_by_entity_owner_revision').execute()
  await sql`delete from records where entity = 'needs'`.execute(db)
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food'))`.execute(db)
}
