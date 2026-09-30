import { computed, type MaybeRefOrGetter, shallowRef, toValue, watchEffect } from 'vue'

import { t, te } from '@/i18n'

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

/**
 * Le titre est gardé **sous forme de fonction** : lue dans un `computed`, elle
 * suit la langue et les données dont elle dépend, si bien qu'un changement de
 * langue met à jour l'onglet sans que l'écran ait à le redemander.
 */
const source = shallowRef<() => string>(() => '')

export const pageTitle = computed(() => source.value())

// Synchrone : le titre du document ne doit jamais retarder sur celui de l'écran.
watchEffect(
  () => {
    if (typeof document === 'undefined') return
    const title = pageTitle.value
    document.title = title === '' ? APP_NAME : `${title} · ${APP_NAME}`
  },
  { flush: 'sync' },
)

export function setPageTitle(title: string | (() => string)): void {
  source.value = typeof title === 'function' ? title : () => title
}

/** Titre propre à un écran, tenu à jour tant que l'écran est affiché. */
export function usePageTitle(title: MaybeRefOrGetter<string>): void {
  setPageTitle(() => toValue(title))
}

/**
 * Titre d'une route : `meta.title` est une clé de traduction (`shell.titles.week`).
 * Une valeur qui n'en est pas une est prise telle quelle.
 */
export function routeTitle(meta: Readonly<Record<string | symbol, unknown>>): string {
  const raw = meta.title
  if (typeof raw !== 'string') return ''
  return te(raw) ? t(raw) : raw
}
