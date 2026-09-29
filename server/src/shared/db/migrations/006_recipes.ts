import { type Kysely, sql } from 'kysely'

/**
 * Recettes : nouvelle entité `recipe`, propre à un profil comme un repas. Aucune
 * autre colonne — elles ne se partagent pas avec le foyer.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs', 'shopping', 'recipe'))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from records where entity = 'recipe'`.execute(db)
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs', 'shopping'))`.execute(db)
}
