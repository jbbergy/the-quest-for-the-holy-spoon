import { z } from 'zod'

/**
 * Registre des thèmes.
 *
 * La liste est **dérivée des fichiers** : chaque dossier de `styles/themes/`
 * portant un `theme.json` devient un thème disponible, sans qu'aucune liste
 * codée en dur n'ait à être tenue à jour. Ajouter un thème se réduit donc à
 * déposer deux fichiers et à l'importer dans `main.scss`.
 */
export const themeMetadataSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'identifiant de thème invalide'),
  name: z.string().min(1),
  author: z.string().min(1),
  description: z.string(),
  /** Indique au navigateur quoi peindre autour de la page (barres de défilement, champs natifs). */
  colorScheme: z.enum(['light', 'dark']),
  /**
   * Couleurs de l'aperçu, dans le choix des couleurs : le fond, sa bordure et
   * deux pastilles. Un thème n'a pas accès aux variables des autres ; ses
   * propres valeurs, lues ici, servent donc à le montrer tel qu'il est.
   */
  preview: z
    .object({
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      border: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      swatches: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(3),
    })
    .optional(),
})

export type ThemeMetadata = z.infer<typeof themeMetadataSchema>

/** Thème appliqué tant que l'utilisateur n'a rien choisi ni exprimé de préférence système. */
export const DEFAULT_THEME_ID = 'aube'

const modules = import.meta.glob<{ default: unknown }>('@/styles/themes/*/theme.json', {
  eager: true,
})

/**
 * Les métadonnées sont validées comme n'importe quelle donnée entrante : un
 * `theme.json` mal formé doit être écarté au chargement plutôt que produire un
 * thème fantôme dans la liste des réglages.
 */
function loadThemes(): ThemeMetadata[] {
  const loaded: ThemeMetadata[] = []

  for (const module of Object.values(modules)) {
    const parsed = themeMetadataSchema.safeParse(module.default)
    if (parsed.success) loaded.push(parsed.data)
    else if (import.meta.env.DEV) {
      console.warn('[thèmes] fichier theme.json ignoré', parsed.error.issues)
    }
  }

  return loaded.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export const AVAILABLE_THEMES: readonly ThemeMetadata[] = loadThemes()

export function findTheme(id: string): ThemeMetadata | null {
  return AVAILABLE_THEMES.find((theme) => theme.id === id) ?? null
}
