import { computed, type ComputedRef, ref } from 'vue'

/**
 * État du service worker, exprimé indépendamment de Workbox.
 *
 * Rien ici n'importe `virtual:pwa-register` : ce module reçoit un *registrar*
 * et ne connaît de lui que deux rappels. C'est ce qui rend l'état testable sans
 * service worker, sans module virtuel et sans navigateur — et ce qui permettrait
 * d'échanger Workbox contre une autre implémentation sans toucher à l'interface.
 */
export interface ServiceWorkerHooks {
  /** Une nouvelle version est installée et attend d'être activée. */
  onNeedRefresh(): void
  /** Le précache est complet : l'application fonctionnera sans réseau. */
  onOfflineReady(): void
}

/**
 * Enregistre le service worker et retourne de quoi l'activer.
 * L'argument `reload` demande le rechargement de la page après activation.
 */
export type ServiceWorkerRegistrar = (
  hooks: ServiceWorkerHooks,
) => (reload?: boolean) => Promise<void>

export interface ServiceWorkerState {
  readonly needRefresh: ComputedRef<boolean>
  readonly offlineReady: ComputedRef<boolean>
  /** Vrai pendant l'activation : le bouton doit rester inerte jusqu'au rechargement. */
  readonly applying: ComputedRef<boolean>
  applyUpdate(): Promise<void>
  dismissUpdate(): void
  dismissOfflineNotice(): void
}

export function createServiceWorkerState(register: ServiceWorkerRegistrar): ServiceWorkerState {
  const needRefresh = ref(false)
  const offlineReady = ref(false)
  const applying = ref(false)

  const activate = register({
    onNeedRefresh: () => {
      needRefresh.value = true
    },
    onOfflineReady: () => {
      offlineReady.value = true
    },
  })

  return {
    needRefresh: computed(() => needRefresh.value),
    offlineReady: computed(() => offlineReady.value),
    applying: computed(() => applying.value),

    /**
     * L'annonce n'est **pas** retirée avant l'activation.
     *
     * En temps normal la page se recharge et la question ne se pose pas ; si
     * l'activation échoue, la proposition doit rester visible plutôt que
     * disparaître en laissant l'utilisateur croire la mise à jour faite.
     */
    async applyUpdate() {
      if (applying.value) return
      applying.value = true
      try {
        await activate(true)
      } finally {
        applying.value = false
      }
    },

    dismissUpdate() {
      needRefresh.value = false
    },

    dismissOfflineNotice() {
      offlineReady.value = false
    },
  }
}

/**
 * État inerte, utilisé tant qu'aucun service worker n'est enregistré.
 *
 * Contrairement au conteneur, dont l'absence est un bug qu'il vaut mieux faire
 * échouer bruyamment, l'absence de service worker est la situation **normale**
 * en développement et dans les tests. Un état neutre évite d'imposer un
 * branchement à chaque composant qui l'observe.
 */
function inertState(): ServiceWorkerState {
  const off = computed(() => false)
  return {
    needRefresh: off,
    offlineReady: off,
    applying: off,
    applyUpdate: async () => undefined,
    dismissUpdate: () => undefined,
    dismissOfflineNotice: () => undefined,
  }
}

let current: ServiceWorkerState | null = null

export function provideServiceWorkerState(state: ServiceWorkerState): void {
  current = state
}

export function useServiceWorkerState(): ServiceWorkerState {
  current ??= inertState()
  return current
}

export function resetServiceWorkerState(): void {
  current = null
}
