import { registerSW } from 'virtual:pwa-register'

import type { ServiceWorkerRegistrar } from './serviceWorker'

/**
 * Le **seul** fichier qui touche au module virtuel de `vite-plugin-pwa`.
 *
 * L'isoler ainsi garde le reste de l'application compilable et testable hors
 * d'un build Vite : ce module n'existe qu'à travers le plugin, et l'importer
 * plus haut contaminerait tout ce qui s'en approche.
 */
export const registerServiceWorker: ServiceWorkerRegistrar = (hooks) =>
  registerSW({
    immediate: true,
    onNeedRefresh: hooks.onNeedRefresh,
    onOfflineReady: hooks.onOfflineReady,
  })
