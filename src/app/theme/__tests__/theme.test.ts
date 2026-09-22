import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChangeThemeUseCase, type ThemeTarget } from '@/app/theme/ChangeThemeUseCase'
import { InMemoryThemePreference } from '@/app/theme/ThemePreference'
import { AVAILABLE_THEMES, findTheme, themeMetadataSchema } from '@/app/theme/themes'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { isErr, isOk } from '@/core/result'

/** Cible espionne : enregistre ce qui aurait été appliqué au document. */
class SpyTarget implements ThemeTarget {
  applied: { themeId: string; colorScheme: string }[] = []

  setTheme(themeId: string, colorScheme: 'light' | 'dark'): void {
    this.applied.push({ themeId, colorScheme })
  }
}

let preference: InMemoryThemePreference
let target: SpyTarget

beforeEach(() => {
  preference = new InMemoryThemePreference()
  target = new SpyTarget()
  setActivePinia(createPinia())
})

describe('registre des thèmes', () => {
  it('découvre les thèmes depuis les fichiers, sans liste codée en dur', () => {
    // Ajouter un thème doit se réduire à déposer deux fichiers.
    expect(AVAILABLE_THEMES.length).toBeGreaterThanOrEqual(3)
    expect(AVAILABLE_THEMES.map((theme) => theme.id)).toContain('aube')
    expect(AVAILABLE_THEMES.map((theme) => theme.id)).toContain('crepuscule')
  })

  it('expose des métadonnées conformes au schéma', () => {
    for (const theme of AVAILABLE_THEMES) {
      expect(themeMetadataSchema.safeParse(theme).success).toBe(true)
    }
  })

  it('trie les thèmes par nom, pour un ordre stable dans les réglages', () => {
    const names = AVAILABLE_THEMES.map((theme) => theme.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')))
  })

  it('propose au moins un thème clair et un thème sombre', () => {
    const schemes = new Set(AVAILABLE_THEMES.map((theme) => theme.colorScheme))

    expect(schemes.has('light')).toBe(true)
    expect(schemes.has('dark')).toBe(true)
  })

  it('n’a pas deux thèmes de même identifiant', () => {
    const ids = AVAILABLE_THEMES.map((theme) => theme.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('retourne null pour un identifiant inconnu', () => {
    expect(findTheme('inexistant')).toBeNull()
  })
})

describe('ChangeThemeUseCase', () => {
  const useCase = (): ChangeThemeUseCase => new ChangeThemeUseCase(preference, target)

  it('applique le thème demandé et mémorise le choix', () => {
    const result = useCase().execute('crepuscule')

    expect(isOk(result)).toBe(true)
    expect(target.applied).toEqual([{ themeId: 'crepuscule', colorScheme: 'dark' }])
    expect(preference.read()).toBe('crepuscule')
  })

  it('refuse un thème inconnu sans rien appliquer ni mémoriser', () => {
    const result = useCase().execute('inexistant')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('UNKNOWN_THEME')
    expect(target.applied).toEqual([])
    expect(preference.read()).toBeNull()
  })

  describe('thème initial', () => {
    it('reprend le choix mémorisé', () => {
      preference.write('contraste')

      expect(useCase().resolveInitial(false).id).toBe('contraste')
    })

    it('ignore un choix mémorisé qui n’existe plus', () => {
      // Un thème désinstallé ou renommé ne doit pas bloquer le démarrage.
      preference.write('theme-disparu')

      expect(useCase().resolveInitial(false).id).toBe('aube')
    })

    it('suit la préférence système sombre en l’absence de choix', () => {
      expect(useCase().resolveInitial(true).colorScheme).toBe('dark')
    })

    it('retombe sur le thème par défaut en l’absence de tout', () => {
      expect(useCase().resolveInitial(false).id).toBe('aube')
    })

    it('le choix explicite prime sur la préférence système', () => {
      preference.write('aube')

      expect(useCase().resolveInitial(true).id).toBe('aube')
    })

    it('applyInitial applique sans mémoriser : rien n’a encore été choisi', () => {
      useCase().applyInitial(true)

      expect(target.applied).toHaveLength(1)
      expect(preference.read()).toBeNull()
    })
  })
})

describe('useThemeStore', () => {
  it('applique le thème initial au démarrage', () => {
    const store = useThemeStore()
    store.configure({ preference, target })

    store.initialize(false)

    expect(store.currentId).toBe('aube')
    expect(store.isDark).toBe(false)
    expect(target.applied).toHaveLength(1)
  })

  it('change de thème et le reflète dans l’état', () => {
    const store = useThemeStore()
    store.configure({ preference, target })
    store.initialize(false)

    expect(store.select('crepuscule')).toBe(true)
    expect(store.currentId).toBe('crepuscule')
    expect(store.isDark).toBe(true)
    expect(store.error).toBeNull()
  })

  it('expose une erreur typée sur un thème inconnu, sans changer l’état', () => {
    const store = useThemeStore()
    store.configure({ preference, target })
    store.initialize(false)

    expect(store.select('inexistant')).toBe(false)
    expect(store.currentId).toBe('aube')
    expect(store.error).toEqual({
      kind: 'application',
      code: 'UNKNOWN_THEME',
      message: expect.stringContaining('inexistant'),
    })
  })

  it('expose la liste destinée aux réglages', () => {
    expect(useThemeStore().available).toBe(AVAILABLE_THEMES)
  })
})

describe('InMemoryThemePreference', () => {
  it('mémorise, relit et efface', () => {
    const store = new InMemoryThemePreference()

    expect(store.read()).toBeNull()
    store.write('aube')
    expect(store.read()).toBe('aube')
    store.clear()
    expect(store.read()).toBeNull()
  })
})
