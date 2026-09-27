import { type MaybeRefOrGetter, readonly, ref, toValue, watchEffect } from 'vue'

/**
 * Titre de l'écran affiché.
 *
 * Il sert deux fois : au titre du document (critère 2.4.2 — l'onglet, la liste
 * des fenêtres et l'historique disent où l'on est) et à l'annonce faite au
 * lecteur d'écran après une navigation (critère 4.1.3), une application
 * monopage ne rechargeant jamais le document.
 *
 * La route en donne un titre par défaut (`meta.title`) ; un écran qui connaît
 * mieux — « Déjeuner du mercredi 23 septembre » — le précise avec
 * `usePageTitle`.
 */
export const APP_NAME = 'Holy Spoon'

const current = ref('')

export const pageTitle = readonly(current)

export function setPageTitle(title: string): void {
  current.value = title
  if (typeof document !== 'undefined') {
    document.title = title === '' ? APP_NAME : `${title} · ${APP_NAME}`
  }
}

/** Titre propre à un écran, tenu à jour tant que l'écran est affiché. */
export function usePageTitle(title: MaybeRefOrGetter<string>): void {
  watchEffect(() => setPageTitle(toValue(title)))
}
