import { z } from 'zod'

/**
 * Schéma du catalogue Ciqual normalisé, produit par `scripts/build-ciqual.mjs`.
 *
 * Le fichier est généré et versionné, donc maîtrisé — mais il reste chargé par
 * le réseau au démarrage, et une validation le distingue d'une page d'erreur HTML
 * ou d'un fichier tronqué par un cache. C'est la même frontière que pour Open
 * Food Facts : ce qui entre dans l'application est validé, quelle qu'en soit
 * l'origine.
 */
export const ciqualFoodSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  group: z.string(),
  /** Code du sous-groupe Ciqual (« 0402 » = viandes crues) — sert au marquage. */
  subGroupCode: z.string(),
  subGroup: z.string(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  /**
   * Nutriments complémentaires, facultatifs au schéma.
   *
   * Non par indulgence, mais pour que l'application reste démarrable avec un
   * catalogue produit par une version antérieure du convertisseur : une
   * validation stricte transformerait une simple régénération oubliée en
   * application vide.
   */
  fiberG: z.number().nonnegative().optional(),
  sugarsG: z.number().nonnegative().optional(),
  saturatedFatG: z.number().nonnegative().optional(),
  saltG: z.number().nonnegative().optional(),
})

export const ciqualCatalogSchema = z.array(ciqualFoodSchema)

export type CiqualFood = z.infer<typeof ciqualFoodSchema>
