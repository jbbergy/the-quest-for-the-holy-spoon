import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { type ErrorView, toErrorView } from '@/core/errors'

import {
  ChangeThemeUseCase,
  DocumentThemeTarget,
  systemPrefersDark,
  type ThemeTarget,
} from './ChangeThemeUseCase'
import { type IThemePreference, LocalThemePreference } from './ThemePreference'
import { AVAILABLE_THEMES, type ThemeMetadata } from './themes'

/**
 * État du thème.
 *
 * Le Use Case est construit ici plutôt que tiré du conteneur applicatif : le
 * thème doit pouvoir s'appliquer avant que le conteneur — et donc IndexedDB —
 * ne soit prêt. Les dépendances restent injectables pour les tests.
 */
export const useThemeStore = defineStore('theme', () => {
  const preference = shallowRef<IThemePreference>(new LocalThemePreference())
  const target = shallowRef<ThemeTarget>(new DocumentThemeTarget())
  const current = shallowRef<ThemeMetadata | null>(null)
  const error = ref<ErrorView | null>(null)

  const available = computed(() => AVAILABLE_THEMES)
  const currentId = computed(() => current.value?.id ?? null)
  const isDark = computed(() => current.value?.colorScheme === 'dark')

  function useCase(): ChangeThemeUseCase {
    return new ChangeThemeUseCase(preference.value, target.value)
  }

  /** Injection pour les tests ; le code applicatif n'appelle jamais ceci. */
  function configure(deps: { preference?: IThemePreference; target?: ThemeTarget }): void {
    if (deps.preference !== undefined) preference.value = deps.preference
    if (deps.target !== undefined) target.value = deps.target
  }

  function initialize(prefersDark: boolean = systemPrefersDark()): ThemeMetadata {
    const theme = useCase().applyInitial(prefersDark)
    current.value = theme
    return theme
  }

  function select(themeId: string): boolean {
    const result = useCase().execute(themeId)
    if (!result.ok) {
      error.value = toErrorView(result.error)
      return false
    }

    current.value = result.value
    error.value = null
    return true
  }

  return {
    current,
    currentId,
    available,
    isDark,
    error,
    configure,
    initialize,
    select,
  }
})
