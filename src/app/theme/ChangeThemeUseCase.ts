import { ApplicationError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

import type { IThemePreference } from './ThemePreference'
import { AVAILABLE_THEMES, DEFAULT_THEME_ID, findTheme, type ThemeMetadata } from './themes'

/**
 * Cible d'application du thème. L'abstraire permet de tester le Use Case sans
 * DOM, et laisse la porte ouverte à un rendu serveur.
 */
export interface ThemeTarget {
  setTheme(themeId: string, colorScheme: 'light' | 'dark'): void
}

/** Cible réelle : l'élément racine du document. */
export class DocumentThemeTarget implements ThemeTarget {
  setTheme(themeId: string, colorScheme: 'light' | 'dark'): void {
    const root = globalThis.document?.documentElement
    if (root === undefined || root === null) return

    root.dataset.theme = themeId
    // Informe le navigateur de la teinte à employer pour ce qu'il peint
    // lui-même : barres de défilement, champs natifs, menus de sélection.
    root.style.colorScheme = colorScheme
  }
}

/**
 * Applique un thème au document et mémorise le choix.
 *
 * L'application se réduit à poser `data-theme` sur `:root` ; ce sont les blocs
 * `[data-theme='…']` de chaque thème qui y redéfinissent les variables CSS.
 *
 * Cette voie a été préférée à l'écriture directe de `style.setProperty` par le
 * JavaScript pour deux raisons. D'abord, aucune valeur de couleur n'a besoin
 * d'exister en JavaScript : elles restent toutes dans le SCSS, source unique.
 * Ensuite, un thème peut ainsi redéfinir plus que des couleurs — une ombre nulle
 * pour le contraste renforcé, par exemple — sans que le code applicatif ait à
 * connaître la liste des propriétés concernées.
 */
export class ChangeThemeUseCase {
  constructor(
    private readonly preference: IThemePreference,
    private readonly target: ThemeTarget = new DocumentThemeTarget(),
  ) {}

  execute(themeId: string): Result<ThemeMetadata, ApplicationError> {
    const theme = findTheme(themeId)
    if (theme === null) {
      return err(
        new ApplicationError(
          'UNKNOWN_THEME',
          `Aucun thème ne porte l’identifiant « ${themeId} ».`,
        ),
      )
    }

    this.target.setTheme(theme.id, theme.colorScheme)
    this.preference.write(theme.id)
    return ok(theme)
  }

  /**
   * Thème à appliquer au démarrage : le choix mémorisé s'il est encore valide,
   * sinon la préférence système, sinon le thème par défaut.
   *
   * Un thème mémorisé mais disparu du registre — désinstallé, renommé — ne doit
   * pas bloquer le démarrage : il est simplement ignoré.
   */
  resolveInitial(prefersDark: boolean): ThemeMetadata {
    const stored = this.preference.read()
    const remembered = stored === null ? null : findTheme(stored)
    if (remembered !== null) return remembered

    if (prefersDark) {
      // Premier thème sombre du registre : aucun identifiant codé en dur ici,
      // pour qu'ajouter ou retirer un thème reste sans effet sur ce code.
      const dark = AVAILABLE_THEMES.find((theme) => theme.colorScheme === 'dark')
      if (dark !== undefined) return dark
    }

    const fallback = findTheme(DEFAULT_THEME_ID) ?? AVAILABLE_THEMES[0]
    if (fallback === undefined) {
      throw new Error('Aucun thème enregistré : styles/themes/ est vide ou invalide.')
    }
    return fallback
  }

  /** Applique le thème initial **sans** l'enregistrer : rien n'a encore été choisi. */
  applyInitial(prefersDark: boolean): ThemeMetadata {
    const theme = this.resolveInitial(prefersDark)
    this.target.setTheme(theme.id, theme.colorScheme)
    return theme
  }
}

/** Préférence système, prudente hors navigateur. */
export function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
