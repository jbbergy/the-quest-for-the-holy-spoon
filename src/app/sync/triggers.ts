import { localChanges } from '@/core/infrastructure/changeJournal'
import type { INetworkStatus } from '@/core/infrastructure/NetworkStatusService'

import { PULL_INTERVAL_MS, type SyncEngine } from './SyncEngine'

/**
 * Ce qui déclenche un cycle de synchronisation :
 * - une écriture locale, envoyée peu après (les rafales partent ensemble) ;
 * - le retour du réseau — les modifications faites hors ligne partent alors ;
 * - le retour de l'application au premier plan, et un intervalle régulier tant
 *   qu'elle y reste — c'est ainsi qu'arrive ce qu'un autre appareil a changé.
 *
 * Un moteur sans compte ignore tout cela (`phase: 'off'`).
 */
export function startSyncTriggers(
  engine: SyncEngine,
  network: INetworkStatus,
  doc: Document = document,
): () => void {
  const stopLocal = localChanges.subscribe(() => engine.schedule())
  const stopNetwork = network.subscribe((online) => {
    if (online) void engine.sync()
  })

  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') void engine.sync()
  }
  doc.addEventListener('visibilitychange', onVisibility)

  const interval = setInterval(() => {
    if (doc.visibilityState === 'visible') void engine.sync()
  }, PULL_INTERVAL_MS)

  return () => {
    stopLocal()
    stopNetwork()
    doc.removeEventListener('visibilitychange', onVisibility)
    clearInterval(interval)
  }
}
