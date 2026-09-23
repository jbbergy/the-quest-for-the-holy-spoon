import { sql } from 'kysely'

import type { AccountId } from '@/core/identity'

import type { Db } from '../../../shared/db/database'
import type { ChangePage, IRecordStore, StoredChange } from '../domain/ports'
import type { IncomingChange, RecordKey } from '../domain/SyncChange'

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

  async apply(owner: AccountId, changes: readonly IncomingChange[]): Promise<readonly RecordKey[]> {
    if (changes.length === 0) return []

    return this.db.transaction().execute(async (tx) => {
      await sql`select pg_advisory_xact_lock(${WRITE_LOCK})`.execute(tx)
      const notOwned: RecordKey[] = []

      for (const change of changes) {
        const key = { entity: change.entity, id: change.id }
        if (change.op === 'upsert') {
          // La clause `where` du `on conflict` refuse d'écraser l'enregistrement
          // d'un autre compte : aucune ligne n'est alors renvoyée.
          const written = await sql<{ revision: string }>`
            insert into records (entity, id, owner_account_id, payload, deleted, revision)
            values (${change.entity}, ${change.id}, ${owner}, ${JSON.stringify(change.payload)}::jsonb,
                    false, nextval('records_revision_seq'))
            on conflict (entity, id) do update
              set payload = excluded.payload, deleted = false,
                  revision = excluded.revision, updated_at = now()
              where records.owner_account_id = excluded.owner_account_id
            returning revision`.execute(tx)
          if (written.rows.length === 0) notOwned.push(key)
          continue
        }

        const deleted = await sql<{ revision: string }>`
          update records
            set payload = null, deleted = true,
                revision = nextval('records_revision_seq'), updated_at = now()
            where entity = ${change.entity} and id = ${change.id}
              and owner_account_id = ${owner} and not deleted
            returning revision`.execute(tx)
        if (deleted.rows.length > 0) continue

        // Rien de supprimé : soit l'enregistrement n'a jamais quitté l'appareil
        // (rien à faire), soit il appartient à un autre compte (refus).
        const other = await tx
          .selectFrom('records')
          .select('owner_account_id')
          .where('entity', '=', change.entity)
          .where('id', '=', change.id)
          .executeTakeFirst()
        if (other !== undefined && other.owner_account_id !== owner) notOwned.push(key)
      }

      return notOwned
    })
  }

  async changesSince(owner: AccountId, since: number, limit: number): Promise<ChangePage> {
    const rows = await sql<RecordRow>`
      select entity, id, payload, deleted, revision::text as revision
        from records
        where owner_account_id = ${owner} and revision > ${since}
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

function toStoredChange(row: RecordRow): StoredChange {
  const base = { entity: row.entity, id: row.id, revision: Number(row.revision) }
  return row.deleted || row.payload === null
    ? { ...base, deleted: true }
    : { ...base, deleted: false, payload: row.payload }
}
