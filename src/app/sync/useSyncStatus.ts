import { type Ref, ref, type ShallowRef, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import type { SyncEngine, SyncSnapshot } from './SyncEngine'

interface SyncStatusBinding {
  readonly status: ShallowRef<SyncSnapshot>
  /** S'incrémente quand des données distantes ont modifié l'appareil. */
  readonly remoteRevision: Ref<number>
}

const bindings = new WeakMap<SyncEngine, SyncStatusBinding>()

/**
 * État de la synchronisation, en références réactives.
 *
 * Les écrans qui affichent des repas observent `remoteRevision` pour se
 * recharger quand un autre appareil a écrit ; le profil, lui, est rechargé
 * ici même, car il conditionne toutes les jauges.
 */
export function useSyncStatus(): SyncStatusBinding {
  const engine = useContainer().sync
  const existing = bindings.get(engine)
  if (existing !== undefined) return existing

  const binding: SyncStatusBinding = {
    status: shallowRef(engine.status),
    remoteRevision: ref(0),
  }
  const players = usePlayerStore()
  engine.subscribe((snapshot) => (binding.status.value = snapshot))
  engine.onRemoteChanges((entities) => {
    if (entities.has('player')) void players.load()
    binding.remoteRevision.value += 1
  })

  bindings.set(engine, binding)
  return binding
}
