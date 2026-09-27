import { ApplicationError } from '@/core/errors'
import type { AccountId, PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

import type { ChangePage, IHouseholdDirectory, IRecordStore } from '../domain/ports'
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
  constructor(
    private readonly records: IRecordStore,
    private readonly household: IHouseholdDirectory,
  ) {}

  async execute(
    account: SyncAccount,
    changes: readonly IncomingChange[],
  ): Promise<Result<readonly Rejection[], NoProfileLinkedError>> {
    const playerId = account.playerId
    if (playerId === null) return err(new NoProfileLinkedError())

    const rejected: Rejection[] = []
    const own: IncomingChange[] = []
    const reject = (key: RecordKey, code: string) =>
      rejected.push({ entity: key.entity, id: key.id, code })
    const household = await this.household.householdOf(account.id)

    for (const change of changes) {
      const verdict = authorizeChange(change, playerId)
      if (!verdict.ok) {
        reject(change, verdict.error.code)
      } else if (verdict.value.kind === 'own') {
        own.push(verdict.value.change)
      } else if (verdict.value.kind === 'shared') {
        // Commun au foyer : seulement le sien. Un ancien membre dont l'appareil
        // enverrait encore une modification n'y touche plus.
        if (verdict.value.householdId === household) own.push(verdict.value.change)
        else reject(change, 'NOT_OWNER')
      } else {
        // Repas prévu pour un autre : il faut un membre du même foyer, et un
        // identifiant encore libre — on crée chez autrui, on n'y modifie rien.
        const { change: offer, playerId: target } = verdict.value
        const member = await this.household.memberAccountOf(account.id, target)
        const created = member !== null && (await this.records.offer(member, offer))
        if (!created) reject(offer, 'NOT_OWNER')
      }
    }

    const notOwned = await this.records.apply(account.id, own, household)
    for (const key of notOwned) reject(key, 'NOT_OWNER')
    return ok(rejected)
  }
}

/**
 * Lecture des modifications survenues depuis une révision donnée : les
 * siennes, les aliments créés par les autres membres du foyer, et la liste de
 * courses du foyer.
 */
export class PullChangesUseCase {
  constructor(
    private readonly records: IRecordStore,
    private readonly household: IHouseholdDirectory,
  ) {}

  async execute(account: SyncAccount, since: number, limit: number): Promise<ChangePage> {
    const [foodAuthors, household] = await Promise.all([
      this.household.coMembers(account.id),
      this.household.householdOf(account.id),
    ])
    return this.records.changesSince(account.id, foodAuthors, household, since, limit)
  }
}
