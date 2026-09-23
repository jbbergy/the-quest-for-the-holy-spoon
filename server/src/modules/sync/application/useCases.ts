import { ApplicationError } from '@/core/errors'
import type { AccountId, PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import type { ChangePage, IRecordStore } from '../domain/ports'
import { authorizeChange, type IncomingChange, type RecordKey } from '../domain/SyncChange'

/** Ce que la synchronisation sait du compte connecté. */
export interface SyncAccount {
  readonly id: AccountId
  readonly playerId: PlayerId | null
}

export interface Rejection extends RecordKey {
  readonly code: string
}

export class NoProfileLinkedError extends ApplicationError {
  constructor() {
    super('NO_PROFILE_LINKED', 'Aucun profil rattaché à ce compte : rien à synchroniser.')
  }
}

/**
 * Réception des modifications d'un appareil.
 *
 * Chaque modification est jugée seule : une modification refusée n'empêche pas
 * les autres de passer, et l'appareil apprend lesquelles abandonner. Refuser le
 * lot entier bloquerait son journal indéfiniment.
 */
export class PushChangesUseCase {
  constructor(private readonly records: IRecordStore) {}

  async execute(
    account: SyncAccount,
    changes: readonly IncomingChange[],
  ): Promise<Result<readonly Rejection[], NoProfileLinkedError>> {
    const playerId = account.playerId
    if (playerId === null) return err(new NoProfileLinkedError())

    const rejected: Rejection[] = []
    const authorized: IncomingChange[] = []
    for (const change of changes) {
      const verdict = authorizeChange(change, playerId)
      if (verdict.ok) authorized.push(verdict.value)
      else rejected.push({ entity: change.entity, id: change.id, code: verdict.error.code })
    }

    const notOwned = await this.records.apply(account.id, authorized)
    return ok([...rejected, ...notOwned.map((key) => ({ ...key, code: 'NOT_OWNER' }))])
  }
}

/** Lecture des modifications survenues depuis une révision donnée. */
export class PullChangesUseCase {
  constructor(private readonly records: IRecordStore) {}

  execute(account: SyncAccount, since: number, limit: number): Promise<ChangePage> {
    return this.records.changesSince(account.id, since, limit)
  }
}
