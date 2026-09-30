import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { setCurrentLocale } from './index'
import { type ILocalePreference, LocalLocalePreference } from './LocalePreference'
import {
  AUTO_LOCALE,
  type Locale,
  matchDeviceLocale,
  type LocalePreference,
  readDeviceLanguages,
  resolveLocale,
} from './locale'

/**
 * Cible d'application de la langue : la propriété `lang` de la page, que
 * lisent les lecteurs d'écran (la voix change) et le navigateur (la césure, les
 * guillemets, la correction orthographique).
 */
export interface LocaleTarget {
  setLocale(locale: Locale): void
}

export class DocumentLocaleTarget implements LocaleTarget {
  setLocale(locale: Locale): void {
    const root = globalThis.document?.documentElement
    if (root !== undefined && root !== null) root.lang = locale
  }
}

/**
 * État de la langue.
 *
 * Comme le thème, elle s'applique **avant le montage** et se lit de façon
 * synchrone : afficher d'abord le français puis l'anglais ferait clignoter tout
 * l'écran. Les dépendances restent injectables pour les tests.
 */
export const useLocaleStore = defineStore('locale', () => {
  const persisted = shallowRef<ILocalePreference>(new LocalLocalePreference())
  const target = shallowRef<LocaleTarget>(new DocumentLocaleTarget())
  const deviceLanguages = shallowRef<() => readonly string[]>(readDeviceLanguages)

  const preference = shallowRef<LocalePreference>(AUTO_LOCALE)
  const current = shallowRef<Locale>('fr')
  const isAuto = computed(() => preference.value === AUTO_LOCALE)

  function apply(): void {
    current.value = resolveLocale(preference.value, deviceLanguages.value())
    setCurrentLocale(current.value)
    target.value.setLocale(current.value)
  }

  /** La langue que l'appareil demande, que « automatique » donnerait. */
  function deviceLocale(): Locale {
    return matchDeviceLocale(deviceLanguages.value())
  }

  /** Injection pour les tests ; le code applicatif n'appelle jamais ceci. */
  function configure(deps: {
    preference?: ILocalePreference
    target?: LocaleTarget
    deviceLanguages?: () => readonly string[]
  }): void {
    if (deps.preference !== undefined) persisted.value = deps.preference
    if (deps.target !== undefined) target.value = deps.target
    if (deps.deviceLanguages !== undefined) deviceLanguages.value = deps.deviceLanguages
  }

  /** Lit le choix mémorisé, puis applique la langue. À appeler avant le montage. */
  function initialize(): Locale {
    preference.value = persisted.value.read() ?? AUTO_LOCALE
    apply()
    return current.value
  }

  /**
   * Choisit une langue, ou « automatique » pour suivre de nouveau l'appareil.
   * « Automatique » efface la mémoire : c'est son absence qui la représente.
   */
  function select(choice: LocalePreference): void {
    preference.value = choice
    if (choice === AUTO_LOCALE) persisted.value.clear()
    else persisted.value.write(choice)
    apply()
  }

  /**
   * L'appareil a changé de langue (`languagechange`). Sans effet si une langue
   * a été choisie dans les réglages : c'est tout l'intérêt de la choisir.
   */
  function followDevice(): void {
    if (preference.value === AUTO_LOCALE) apply()
  }

  return { preference, current, isAuto, deviceLocale, configure, initialize, select, followDevice }
})
