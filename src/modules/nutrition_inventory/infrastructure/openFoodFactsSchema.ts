import { z } from 'zod'

/**
 * Schéma de la réponse Open Food Facts.
 *
 * C'est une base contributive : la plupart des champs sont facultatifs, les
 * valeurs numériques arrivent tantôt en nombre tantôt en chaîne, et un produit
 * peut n'avoir aucune donnée nutritionnelle. Le schéma accepte donc largement en
 * entrée et **normalise en sortie** — c'est tout l'objet de la couche
 * anti-corruption : le désordre s'arrête ici, il n'atteint pas le domaine.
 */

/**
 * Accepte `12.5`, `"12.5"`, `"12,5"` ; ramène tout le reste à `undefined`.
 *
 * `null` doit être admis en entrée : la base est contributive et un champ
 * nutritionnel vidé par un contributeur y arrive à `null`. Le refuser ferait
 * échouer la validation du produit entier au lieu d'ignorer le seul champ
 * concerné.
 */
const loonyNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value !== 'string') return undefined
    const parsed = Number.parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : undefined
  })

const nutrimentsSchema = z
  .object({
    'energy-kcal_100g': loonyNumber,
    proteins_100g: loonyNumber,
    carbohydrates_100g: loonyNumber,
    fat_100g: loonyNumber,
    fiber_100g: loonyNumber,
    sugars_100g: loonyNumber,
    'saturated-fat_100g': loonyNumber,
    /**
     * Open Food Facts publie `salt_100g` **et** `sodium_100g`, souvent l'un sans
     * l'autre. Les deux sont acceptés ; la conversion sodium → sel se fait dans
     * l'adaptateur, pas ici, le schéma se bornant à normaliser les formes.
     */
    salt_100g: loonyNumber,
    sodium_100g: loonyNumber,
  })
  .loose()

const productSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    product_name: z.string().optional(),
    product_name_fr: z.string().optional(),
    brands: z.string().optional(),
    nutriments: nutrimentsSchema.optional(),
    labels_tags: z.array(z.string()).optional(),
    allergens_tags: z.array(z.string()).optional(),
  })
  .loose()

/**
 * `status` vaut 1 (trouvé) ou 0 (inconnu). Un code inexistant renvoie un HTTP
 * 404 tandis qu'un code malformé renvoie un HTTP 200 : seul le corps fait foi,
 * jamais le code de statut HTTP.
 */
export const openFoodFactsResponseSchema = z
  .object({
    status: z.union([z.literal(0), z.literal(1)]).optional(),
    status_verbose: z.string().optional(),
    product: productSchema.optional(),
  })
  .loose()

/**
 * Réponse de `/cgi/search.pl`.
 *
 * `products` peut manquer, être vide, ou contenir des fiches sans aucune donnée
 * nutritionnelle : chacune est validée puis traduite séparément, et une fiche
 * inexploitable est écartée sans faire échouer les autres.
 */
export const openFoodFactsSearchSchema = z
  .object({
    count: z.number().optional(),
    products: z.array(productSchema).optional(),
  })
  .loose()

export type OpenFoodFactsResponse = z.infer<typeof openFoodFactsResponseSchema>
export type OpenFoodFactsProduct = z.infer<typeof productSchema>

/** Champs demandés à l'API : la réponse complète pèse ~150 Ko contre ~3 Ko filtrée. */
export const REQUESTED_FIELDS = [
  'code',
  'product_name',
  'product_name_fr',
  'brands',
  'nutriments',
  'labels_tags',
  'allergens_tags',
].join(',')
