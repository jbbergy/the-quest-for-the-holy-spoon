import { sql } from 'kysely'

import type { AccountId } from '@/core/identity'

import type { Db } from '../../../shared/db/database'
import type { ChangePage, IRecordStore, StoredChange } from '../domain/ports'
import type { IncomingChange, IncomingUpsert, RecordKey } from '../domain/SyncChange'

/**
 * Clé du verrou qui sérialise les écritures.
 *
 * Une séquence Postgres distribue ses numéros à l'appel, pas à la validation :
 * deux envois simultanés pourraient valider la révision 11 avant la 10, et un
 * appareil qui lirait entre les deux avancerait son curseur au-delà d'une
 * écriture qu'il n'aurait jamais vue. Sérialiser les écritures garantit
 * qu'une révision n'est visible que lorsque toutes les précédentes le sont.
 * Le volume d'une application de repas le permet largement.
 */
const WRITE_LOCK = 4_319_001

interface RecordRow {
  readonly entity: StoredChange['entity']
  readonly id: string
  readonly payload: Record<string, unknown> | null
  readonly deleted: boolean
  readonly revision: string
}

export class KyselyRecordStore implements IRecordStore {
  constructor(private readonly db: Db) {}

  async apply(
    owner: AccountId,
    changes: readonly IncomingChange[],
    household: string | null,
  ): Promise<readonly RecordKey[]> {
    if (changes.length === 0) return []

    return this.db.transaction().execute(async (tx) => {
      await sql`select pg_advisory_xact_lock(${WRITE_LOCK})`.execute(tx)
      const notOwned: RecordKey[] = []

      for (const change of changes) {
        const key = { entity: change.entity, id: change.id }
        if (change.op === 'upsert') {
          // La clause `where` du `on conflict` refuse d'écraser l'enregistrement
          // d'un autre compte, sauf s'il est commun au même foyer : aucune ligne
          // n'est alors renvoyée. L'auteur d'un enregistrement commun reste
          // celui qui l'a créé.
          const shared = sharedHousehold(change.entity, change.payload)
          const written = await sql<{ revision: string }>`
            insert into records (entity, id, owner_account_id, household_id, payload, deleted, revision)
            values (${change.entity}, ${change.id}, ${owner}, ${shared}::uuid,
                    ${JSON.stringify(change.payload)}::jsonb, false, nextval('records_revision_seq'))
            on conflict (entity, id) do update
              set payload = excluded.payload, deleted = false,
                  revision = excluded.revision, updated_at = now()
              where (records.household_id is null and excluded.household_id is null
                     and records.owner_account_id = excluded.owner_account_id)
                 or records.household_id = excluded.household_id
            returning revision`.execute(tx)
          if (written.rows.length === 0) notOwned.push(key)
          continue
        }

        const deleted = await sql<{ revision: string }>`
          update records
            set payload = null, deleted = true,
                revision = nextval('records_revision_seq'), updated_at = now()
            where entity = ${change.entity} and id = ${change.id} and not deleted
              and ((owner_account_id = ${owner} and household_id is null)
                   or household_id = ${household}::uuid)
            returning revision`.execute(tx)
        if (deleted.rows.length > 0) continue

        // Rien de supprimé : soit l'enregistrement n'a jamais quitté l'appareil,
        // ou il est déjà supprimé (rien à faire), soit il appartient à un autre
        // compte ou à un autre foyer (refus).
        const other = await tx
          .selectFrom('records')
          .select(['owner_account_id', 'household_id'])
          .where('entity', '=', change.entity)
          .where('id', '=', change.id)
          .executeTakeFirst()
        const reachable =
          other === undefined ||
          (other.household_id === null
            ? other.owner_account_id === owner
            : other.household_id === household)
        if (!reachable) notOwned.push(key)
      }

      return notOwned
    })
  }

  async offer(owner: AccountId, change: IncomingUpsert): Promise<boolean> {
    return this.db.transaction().execute(async (tx) => {
      await sql`select pg_advisory_xact_lock(${WRITE_LOCK})`.execute(tx)
      const created = await sql<{ revision: string }>`
        insert into records (entity, id, owner_account_id, payload, deleted, revision)
        values (${change.entity}, ${change.id}, ${owner}, ${JSON.stringify(change.payload)}::jsonb,
                false, nextval('records_revision_seq'))
        on conflict (entity, id) do nothing
        returning revision`.execute(tx)
      return created.rows.length > 0
    })
  }

  async changesSince(
    owner: AccountId,
    foodAuthors: readonly AccountId[],
    household: string | null,
    since: number,
    limit: number,
  ): Promise<ChangePage> {
    // `= any` accepte un tableau vide : sans foyer, la deuxième branche ne lit
    // rien, et la troisième non plus (`= null` n'est jamais vrai). Ce qu'on a
    // écrit dans un ancien foyer n'est plus lu : il n'est plus à soi.
    const rows = await sql<RecordRow>`
      select entity, id, payload, deleted, revision::text as revision
        from records
        where revision > ${since}
          and ((owner_account_id = ${owner} and household_id is null)
               or (entity = 'food' and owner_account_id = any(${[...foodAuthors]}::uuid[]))
               or household_id = ${household}::uuid)
        -- La colonne, pas l'alias : \`revision::text\` se trierait comme du texte
        -- (« 1000 » avant « 999 »), et le curseur sauterait des écritures.
        order by records.revision
        limit ${limit + 1}`.execute(this.db)

    return {
      changes: rows.rows.slice(0, limit).map(toStoredChange),
      hasMore: rows.rows.length > limit,
    }
  }
}

/** Foyer d'un enregistrement commun, ou `null` : seule la liste de courses d'un foyer l'est. */
function sharedHousehold(entity: string, payload: Readonly<Record<string, unknown>>): string | null {
  return entity === 'shopping' && typeof payload.householdId === 'string' ? payload.householdId : null
}

function toStoredChange(row: RecordRow): StoredChange {
  const base = { entity: row.entity, id: row.id, revision: Number(row.revision) }
  return row.deleted || row.payload === null
    ? { ...base, deleted: true }
    : { ...base, deleted: false, payload: row.payload }
}
