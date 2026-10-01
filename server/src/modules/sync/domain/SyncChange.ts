import { DomainError } from '@/core/errors'
import { idFrom, type PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'

export type SyncEntity = 'player' | 'meal' | 'food' | 'needs' | 'shopping' | 'recipe' | 'portion'

export interface RecordKey {
  readonly entity: SyncEntity
  readonly id: string
}

export type IncomingChange =
  | (RecordKey & { readonly op: 'upsert'; readonly payload: Readonly<Record<string, unknown>> })
  | (RecordKey & { readonly op: 'delete' })

export type IncomingUpsert = Extract<IncomingChange, { op: 'upsert' }>

/**
 * Verdict d'autorisation.
 *
 * `own` : l'enregistrement appartient au compte qui l'envoie.
 * `forMember` : un repas prévu **pour** un autre profil — la seule écriture
 * permise chez autrui. Il reste à vérifier que ce profil est bien celui d'un
 * membre du même foyer, ce que seul le stockage sait.
 */
export type AuthorizedChange =
  | { readonly kind: 'own'; readonly change: IncomingChange }
  | { readonly kind: 'forMember'; readonly change: IncomingUpsert; readonly playerId: PlayerId }
  | { readonly kind: 'shared'; readonly change: IncomingUpsert; readonly householdId: string }

/** Modification refusée pour de bon : la renvoyer n'y changerait rien. */
export class SyncRejectedError extends DomainError {}

/**
 * Qui peut écrire quoi.
 *
 * Un compte n'écrit que ce qui lui appartient : son profil et ses besoins, ses
 * repas, les aliments qu'il a créés. Le serveur ne fait pas confiance à
 * l'appareil pour le dire — il le vérifie dans le contenu même de
 * l'enregistrement.
 *
 * Deux exceptions, au sein du foyer :
 * - **créer** un repas non pris pour un autre membre, en le signant
 *   (`plannedBy`). Le membre en devient propriétaire ; il l'ajuste et le coche
 *   lui-même ;
 * - la liste de courses du foyer (`shopping` avec `householdId`), que tous ses
 *   membres écrivent. Reste à vérifier que c'est bien **son** foyer.
 *
 * La propriété des enregistrements **déjà stockés** (qu'on ne peut écraser ni
 * supprimer quand ils sont à autrui) relève du stockage : c'est le seul endroit
 * qui connaît le propriétaire actuel d'un identifiant.
 */
export function authorizeChange(
  change: IncomingChange,
  playerId: PlayerId,
): Result<AuthorizedChange, SyncRejectedError> {
  if (change.op === 'delete') {
    return change.entity === 'player' || change.entity === 'needs'
      ? err(new SyncRejectedError('PROFILE_NOT_DELETABLE', 'Un profil se supprime avec son compte.'))
      : ok({ kind: 'own', change })
  }

  const { payload } = change
  if (payload.id !== change.id) {
    return err(new SyncRejectedError('INVALID_RECORD', 'Identifiant incohérent avec le contenu.'))
  }
  const own = ok({ kind: 'own', change } as const)

  switch (change.entity) {
    case 'player':
      return change.id === playerId ? own : notOwner()
    case 'needs':
      return change.id === playerId && payload.playerId === playerId ? own : notOwner()
    case 'meal':
      if (payload.playerId === playerId) return own
      return isOfferFrom(payload, playerId)
        ? ok({ kind: 'forMember', change, playerId: idFrom<'PlayerId'>(payload.playerId as string) })
        : notOwner()
    case 'recipe':
    case 'portion':
      return payload.playerId === playerId ? own : notOwner()
    case 'food':
      if (payload.source !== 'USER') {
        return err(
          new SyncRejectedError('INVALID_RECORD', 'Seuls les aliments créés à la main se synchronisent.'),
        )
      }
      return payload.ownerId === playerId ? own : notOwner()
    case 'shopping':
      if (typeof payload.householdId === 'string' && payload.householdId !== '') {
        return ok({ kind: 'shared', change, householdId: payload.householdId })
      }
      return payload.householdId === null && payload.playerId === playerId ? own : notOwner()
  }
}

/** Repas proposé à un autre profil : signé par l'expéditeur, et pas encore pris. */
function isOfferFrom(payload: Readonly<Record<string, unknown>>, playerId: PlayerId): boolean {
  return (
    typeof payload.playerId === 'string' &&
    payload.playerId !== '' &&
    payload.plannedBy === playerId &&
    // Explicitement `null` : un enregistrement sans la clé date d'avant la
    // distinction prévu/pris, et se lit comme un repas pris.
    payload.consumedAt === null
  )
}

function notOwner(): Result<never, SyncRejectedError> {
  return err(new SyncRejectedError('NOT_OWNER', 'Cet enregistrement appartient à un autre profil.'))
}
