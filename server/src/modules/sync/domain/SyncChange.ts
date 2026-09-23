import { DomainError } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

export type SyncEntity = 'player' | 'meal' | 'food'

export interface RecordKey {
  readonly entity: SyncEntity
  readonly id: string
}

export type IncomingChange =
  | (RecordKey & { readonly op: 'upsert'; readonly payload: Readonly<Record<string, unknown>> })
  | (RecordKey & { readonly op: 'delete' })

/** Modification refusée pour de bon : la renvoyer n'y changerait rien. */
export class SyncRejectedError extends DomainError {}

/**
 * Qui peut écrire quoi.
 *
 * Un compte n'écrit que ce qui lui appartient : son profil, ses repas, les
 * aliments qu'il a créés. Le serveur ne fait pas confiance à l'appareil pour
 * le dire — il le vérifie dans le contenu même de l'enregistrement.
 *
 * La propriété des enregistrements **déjà stockés** (qu'on ne peut écraser ni
 * supprimer quand ils sont à autrui) relève du stockage : c'est le seul endroit
 * qui connaît le propriétaire actuel d'un identifiant.
 */
export function authorizeChange(
  change: IncomingChange,
  playerId: PlayerId,
): Result<IncomingChange, SyncRejectedError> {
  if (change.op === 'delete') {
    return change.entity === 'player'
      ? err(new SyncRejectedError('PROFILE_NOT_DELETABLE', 'Un profil se supprime avec son compte.'))
      : ok(change)
  }

  const { payload } = change
  if (payload.id !== change.id) {
    return err(new SyncRejectedError('INVALID_RECORD', 'Identifiant incohérent avec le contenu.'))
  }

  switch (change.entity) {
    case 'player':
      return change.id === playerId ? ok(change) : notOwner()
    case 'meal':
      return payload.playerId === playerId ? ok(change) : notOwner()
    case 'food':
      return payload.source === 'USER'
        ? ok(change)
        : err(new SyncRejectedError('INVALID_RECORD', 'Seuls les aliments créés à la main se synchronisent.'))
  }
}

function notOwner(): Result<never, SyncRejectedError> {
  return err(new SyncRejectedError('NOT_OWNER', 'Cet enregistrement appartient à un autre profil.'))
}
