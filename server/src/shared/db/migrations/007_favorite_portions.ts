import { type Kysely, sql } from 'kysely'

/**
 * Portions favorites : nouvelle entité `portion`, propre à un profil comme une
 * recette. Aucune autre colonne — elles ne se partagent pas avec le foyer.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs', 'shopping', 'recipe', 'portion'))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from records where entity = 'portion'`.execute(db)
  await sql`alter table records drop constraint records_entity_check`.execute(db)
  await sql`alter table records add constraint records_entity_check
    check (entity in ('player', 'meal', 'food', 'needs', 'shopping', 'recipe'))`.execute(db)
}
