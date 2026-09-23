import { MAX_CHANGES_PER_PUSH } from '@/contract/sync'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { SyncEntity } from '@/core/infrastructure/changeJournal'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { ok, type Result } from '@/core/result'

import type { ILocalReplica, ISyncGateway } from './ports'

/**
 * `off` : aucun compte connecté. `offline` : réseau coupé ou serveur
 * injoignable — les modifications attendent, rien n'est perdu.
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncSnapshot {
  readonly phase: SyncPhase
  /** Modifications locales pas encore envoyées. */
  readonly pending: number
  readonly lastSyncedAt: Date | null
  readonly error: ErrorView | null
}

export interface SyncSession {
  readonly accountId: string
  readonly playerId: string
}

/** Ce que la connexion d'un compte a fait des données de l'appareil. */
export type ConnectOutcome = 'resumed' | 'uploaded' | 'downloaded'

/** Délai entre une écriture locale et son envoi : les rafales partent en une fois. */
export const PUSH_DELAY_MS = 2_000
/** Relecture périodique tant que l'application est ouverte. */
export const PULL_INTERVAL_MS = 5 * 60_000

type Listener<T> = (value: T) => void

/**
 * Moteur de synchronisation différée.
 *
 * Il envoie d'abord, puis lit : les modifications locales reçoivent leur
 * révision avant que l'appareil ne relise la sienne, et ne peuvent donc pas
 * être écrasées par une version plus ancienne. Un seul cycle tourne à la fois ;
 * une demande pendant un cycle en relance un autre à la fin, jamais deux en
 * parallèle.
 *
 * Le moteur n'a aucune règle métier : il transporte des enregistrements. Ce que
 * contient un repas ou un profil ne le regarde pas.
 */
export class SyncEngine {
  private snapshot: SyncSnapshot = { phase: 'off', pending: 0, lastSyncedAt: null, error: null }
  private running: Promise<void> | null = null
  private rerun = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<Listener<SyncSnapshot>>()
  private readonly remoteListeners = new Set<Listener<ReadonlySet<SyncEntity>>>()

  constructor(
    private readonly replica: ILocalReplica,
    private readonly gateway: ISyncGateway,
    private readonly network: INetworkStatus,
  ) {}

  get status(): SyncSnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener<SyncSnapshot>): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  /** Prévient quand des données distantes ont modifié l'appareil. */
  onRemoteChanges(listener: Listener<ReadonlySet<SyncEntity>>): () => void {
    this.remoteListeners.add(listener)
    return () => this.remoteListeners.delete(listener)
  }

  /**
   * Branche l'appareil sur un compte.
   *
   * - même compte qu'avant : on reprend là où on en était ;
   * - le compte a pour profil celui de l'appareil : tout ce que l'appareil en
   *   sait part au serveur (premier appareil, ou profil créé hors compte) ;
   * - le compte a un autre profil : on le télécharge, et il devient le profil
   *   courant. Le profil local éventuel reste intact, hors compte.
   */
  async connect(
    session: SyncSession,
    localPlayerId: string | null,
  ): Promise<Result<ConnectOutcome, BaseError>> {
    const current = await this.replica.state()
    if (!current.ok) return current

    const resumed =
      current.value?.accountId === session.accountId &&
      current.value.playerId === session.playerId
    if (resumed) {
      await this.sync()
      return ok('resumed')
    }

    if (current.value !== null) {
      // Un autre compte était branché : il aurait dû être déconnecté. Sa
      // copie locale reste, seul son journal est abandonné.
      const stopped = await this.replica.stop({ wipe: false })
      if (!stopped.ok) return stopped
    }

    const started = await this.replica.start({ ...session, cursor: 0 })
    if (!started.ok) return started

    if (session.playerId === localPlayerId) {
      const queued = await this.replica.enqueueAll(session.playerId)
      if (!queued.ok) return queued
      await this.sync()
      return ok('uploaded')
    }

    // Télécharger d'abord : le profil ne devient courant qu'une fois présent.
    const downloaded = await this.pullAll()
    if (!downloaded.ok) {
      await this.replica.stop({ wipe: true })
      this.update({ phase: 'off', pending: 0 })
      return downloaded
    }
    const made = await this.replica.makeCurrent(session.playerId)
    if (!made.ok) return made
    this.update({ phase: 'idle', lastSyncedAt: new Date(), error: null })
    return ok('downloaded')
  }

  /** Programme un cycle peu après une écriture locale. */
  schedule(delayMs = PUSH_DELAY_MS): void {
    if (this.snapshot.phase === 'off') return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.sync()
    }, delayMs)
  }

  /** Lance un cycle maintenant, ou à la fin de celui en cours. */
  sync(): Promise<void> {
    if (this.running !== null) {
      this.rerun = true
      return this.running
    }
    this.running = this.cycle().finally(() => {
      this.running = null
      if (this.rerun) {
        this.rerun = false
        void this.sync()
      }
    })
    return this.running
  }

  /**
   * Dernier envoi avant déconnexion. Renvoie ce qui n'a pas pu partir : c'est
   * à l'interface de demander si l'on se déconnecte quand même.
   */
  async flush(): Promise<number> {
    await this.sync()
    const count = await this.replica.pendingCount()
    return count.ok ? count.value : Number.POSITIVE_INFINITY
  }

  /** Débranche l'appareil du compte. */
  async disconnect(options: { readonly wipe: boolean }): Promise<Result<void, BaseError>> {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const stopped = await this.replica.stop(options)
    if (stopped.ok) this.update({ phase: 'off', pending: 0, error: null })
    return stopped
  }

  // --- Cycle ---------------------------------------------------------------

  private async cycle(): Promise<void> {
    const state = await this.replica.state()
    if (!state.ok || state.value === null) {
      this.update({ phase: 'off', pending: 0 })
      return
    }
    await this.refreshPending()
    if (!this.network.isOnline()) {
      this.update({ phase: 'offline' })
      return
    }

    this.update({ phase: 'syncing' })
    const pushed = await this.pushAll()
    const pulled = pushed.ok ? await this.pullAll() : pushed
    await this.refreshPending()

    if (pulled.ok) {
      this.update({ phase: 'idle', lastSyncedAt: new Date(), error: null })
    } else {
      const unreachable = pulled.error.code === 'SERVER_UNREACHABLE'
      this.update({
        phase: unreachable ? 'offline' : 'error',
        error: unreachable ? null : toErrorView(pulled.error),
      })
    }
  }

  private async pushAll(): Promise<Result<void, BaseError>> {
    for (;;) {
      const batch = await this.replica.pending(MAX_CHANGES_PER_PUSH)
      if (!batch.ok) return batch
      if (batch.value === null) return ok(undefined)

      const response = await this.gateway.push(batch.value.changes)
      if (!response.ok) return response

      // Une modification refusée l'est pour de bon (elle vise un enregistrement
      // d'autrui, ou n'a pas le bon format) : la garder bloquerait le journal.
      const acknowledged = await this.replica.acknowledge(batch.value.lastSeq)
      if (!acknowledged.ok) return acknowledged
    }
  }

  private async pullAll(): Promise<Result<void, BaseError>> {
    for (;;) {
      const state = await this.replica.state()
      if (!state.ok) return state
      if (state.value === null) return ok(undefined)

      const page = await this.gateway.pull(state.value.cursor)
      if (!page.ok) return page

      const applied = await this.replica.applyRemote(page.value.changes, page.value.revision)
      if (!applied.ok) return applied
      if (applied.value.size > 0) {
        for (const listener of this.remoteListeners) listener(applied.value)
      }
      if (!page.value.hasMore) return ok(undefined)
    }
  }

  private async refreshPending(): Promise<void> {
    const count = await this.replica.pendingCount()
    if (count.ok) this.update({ pending: count.value })
  }

  private update(changes: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes }
    for (const listener of this.listeners) listener(this.snapshot)
  }
}

