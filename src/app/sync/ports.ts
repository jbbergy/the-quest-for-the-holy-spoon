import type { ApiError } from '@/contract/apiClient'
import type { OutgoingChange, PullResponse, RejectedChange, RemoteChange } from '@/contract/sync'
import type { SyncEntity, SyncState } from '@/core/infrastructure/changeJournal'
import type { RepositoryError } from '@/core/errors'
import type { Result } from '@/core/result'

/**
 * Ports de la synchronisation.
 *
 * La synchronisation n'est pas un contexte métier : c'est le transport des
 * données de trois contextes entre l'appareil et le serveur. Elle vit donc dans
 * `src/app/`, la seule couche autorisée à les connaître tous — mais garde la
 * même discipline : le moteur ne voit que ces deux ports, jamais IndexedDB ni
 * `fetch`.
 */
export interface ISyncGateway {
  push(changes: readonly OutgoingChange[]): Promise<Result<readonly RejectedChange[], ApiError>>
  pull(since: number): Promise<Result<PullResponse, ApiError>>
}

/** Modifications locales prêtes à partir, et jusqu'où elles vident le journal. */
export interface PendingBatch {
  readonly changes: readonly OutgoingChange[]
  /** Dernière entrée du journal couverte : l'acquitter ne touche pas aux suivantes. */
  readonly lastSeq: number
}

export interface ILocalReplica {
  state(): Promise<Result<SyncState | null, RepositoryError>>
  /** Commence à journaliser pour ce compte et ce profil. */
  start(state: SyncState): Promise<Result<void, RepositoryError>>
  /** Inscrit au journal tout ce qui appartient au profil : premier envoi d'un appareil. */
  enqueueAll(playerId: string): Promise<Result<void, RepositoryError>>
  pending(limit: number): Promise<Result<PendingBatch | null, RepositoryError>>
  pendingCount(): Promise<Result<number, RepositoryError>>
  acknowledge(lastSeq: number): Promise<Result<void, RepositoryError>>
  /**
   * Applique des modifications distantes et avance le curseur, d'un bloc. Un
   * enregistrement modifié localement et pas encore envoyé n'est pas écrasé :
   * la version locale partira ensuite et l'emportera.
   */
  applyRemote(
    changes: readonly RemoteChange[],
    cursor: number,
  ): Promise<Result<ReadonlySet<SyncEntity>, RepositoryError>>
  /** Fait du profil du compte le profil courant de l'appareil. */
  makeCurrent(playerId: string): Promise<Result<void, RepositoryError>>
  /**
   * Cesse de synchroniser. `wipe` efface aussi la copie locale du profil et de
   * ses repas : l'appareil peut être partagé, les données suivent le compte.
   */
  stop(options: { readonly wipe: boolean }): Promise<Result<void, RepositoryError>>
}
